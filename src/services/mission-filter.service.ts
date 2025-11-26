// src/services/mission-filter.service.ts

import type { Kysely } from 'kysely';
import OpenAI from 'openai';
import crypto from 'crypto';

import type {
  FilteredMission,
  NormalizedMission,
  RawMissionInput,
  UserScoringContext,
  WMoonWeights,
} from '../types/mission-filter.types';

import { calculateWMoonScore, getDefaultWeights } from '../utils/scoring-functions';
import { UserAIProfileService } from './ai-profile.service';
import type { DB } from '../types/db';

// Helper: ISO string safe
function toISO(d: Date | string | null | undefined): string {
  if (!d) return new Date().toISOString();
  return new Date(d).toISOString();
}

export class MissionFilterService {
  private db: Kysely<DB>;
  private openai: OpenAI;
  private aiProfileService: UserAIProfileService;
  private logger: Console;

  constructor(deps: { db: Kysely<DB>; openai: OpenAI; logger?: Console }) {
    this.db = deps.db;
    this.openai = deps.openai;
    this.logger = deps.logger ?? console;

    this.aiProfileService = new UserAIProfileService(this.db);
  }

  // -----------------------------------------------------------------------------
  // 🎯 Entry-point principale chiamato da /missions/:id/filter-ai
  // -----------------------------------------------------------------------------
  async filterMissionById(userId: string, missionId: string) {
    const mission = await this.db
      .selectFrom('missions')
      .selectAll()
      .where('id', '=', missionId)
      .executeTakeFirst();

    if (!mission) throw new Error(`Mission ${missionId} non trovata.`);

    const deadlineDate =
      mission.deadline !== null && mission.deadline !== undefined
        ? new Date(mission.deadline)
        : new Date();

    const raw: RawMissionInput = {
      id: mission.id,
      title: mission.title,
      description: mission.description ?? '',
      rewardAmount: Number(mission.reward_amount ?? 0),
      estimatedHours: Number(mission.estimated_duration_hours ?? 1),
      deadline: deadlineDate,
      sourceId: mission.source_url ?? 'unknown',
    };

    const resultList = await this.filterMissionsForUser(userId, [raw]);
    const result = resultList[0];

    // mission_filters: factors_breakdown è JSONB/Record<string, number>
    await this.db
      .insertInto('mission_filters')
      .values({
        id: crypto.randomUUID(),
        mission_id: missionId,
        user_id: userId,
        total_score: result.totalScore,
        factors_breakdown: result.factors as unknown as Record<string, number>,
        is_scam: result.isScam,
        calculated_at: toISO(new Date()),
      })
      .onConflict((oc) =>
        oc.columns(['mission_id', 'user_id']).doUpdateSet({
          total_score: result.totalScore,
          factors_breakdown: result.factors as unknown as Record<string, number>,
          is_scam: result.isScam,
          calculated_at: toISO(new Date()),
        }),
      )
      .execute();

    // ai_audit_log: snapshot_weights JSONB/Record<string, number> | null
    await this.db
      .insertInto('ai_audit_log')
      .values({
        id: crypto.randomUUID(),
        user_id: userId,
        mission_id: missionId,
        created_at: toISO(new Date()),
        decision_type: result.isScam ? 'SCAM_BLOCK' : 'HIGH_SCORE',
        explanation: result.reasoning,
        snapshot_weights: result.factors as unknown as Record<string, number>,
      })
      .execute();

    return result;
  }

  // -----------------------------------------------------------------------------
  // 🌕 W-MOON full scoring engine
  // -----------------------------------------------------------------------------
  async filterMissionsForUser(
    userId: string,
    rawMissions: RawMissionInput[],
  ): Promise<FilteredMission[]> {
    if (!rawMissions.length) return [];

    const user = await this.buildUserContext(userId);

    const normalized: NormalizedMission[] = await Promise.all(
      rawMissions.map((m) => this.normalizeMissionWithNLP(m)),
    );

    const now = new Date();
    const results: FilteredMission[] = [];

    for (const m of normalized) {
      const wm = calculateWMoonScore(user, m, user.weights, now);

      results.push({
        missionId: m.id,
        userId,
        totalScore: wm.score,
        isScam: wm.isScam,
        scamReason: wm.scamReason,
        factors: wm.factors,
        reasoning: this.buildReasoning(m, wm.score, wm),
        normalizedMission: m,
      });
    }

    results.sort((a, b) => {
      if (a.isScam && !b.isScam) return 1;
      if (!a.isScam && b.isScam) return -1;
      return b.totalScore - a.totalScore;
    });

    return results;
  }

  // -----------------------------------------------------------------------------
  // 🧠 USER CONTEXT
  // -----------------------------------------------------------------------------
  private async buildUserContext(userId: string): Promise<UserScoringContext> {
    const [user, profile] = await Promise.all([
      this.db
        .selectFrom('users')
        .selectAll()
        .where('id', '=', userId)
        .executeTakeFirst(),
      this.db
        .selectFrom('user_ai_profile')
        .selectAll()
        .where('user_id', '=', userId)
        .executeTakeFirst(),
    ]);

    if (!user) throw new Error(`User ${userId} not found`);

    const skillVector = (profile?.skill_vector ?? {}) as Record<string, number>;

    const skills = new Set(
      Object.entries(skillVector)
        .filter(([, v]) => v > 0.3)
        .map(([k]) => k.toLowerCase()),
    );

    const weights: WMoonWeights =
      (profile?.weights as WMoonWeights | null) ?? getDefaultWeights();

    const lastActive = new Date(user.last_active_at);

    return {
      userId,
      skills,
      avgHourlyRate: 30,
      skillLevel: profile ? 7 : 5,
      lastActiveAt: lastActive,
      streakCount: 0,
      hasHistory: false,
      successes: 0,
      failures: 0,
      trustMap: {},
      weights,
      learningRate: profile?.learning_rate ?? 0.05,
    };
  }

  // -----------------------------------------------------------------------------
  // 🔍 NLP NORMALIZATION
  // -----------------------------------------------------------------------------
  private async normalizeMissionWithNLP(
    raw: RawMissionInput,
  ): Promise<NormalizedMission> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: `Restituisci SOLO JSON con:
{
  "category": "coding" | "writing" | "design" | "admin" | "other",
  "skills": string[],
  "difficulty": number,
  "cognitiveLoad": number,
  "physicalLoad": number
}`,
          },
          {
            role: 'user',
            content: `
Titolo: ${raw.title}
Descrizione: ${raw.description}
Reward: ${raw.rewardAmount}
Ore: ${raw.estimatedHours}
          `.trim(),
          },
        ],
      });

      const content = completion.choices[0].message?.content ?? '{}';
      let parsed: any;

      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = {};
      }

      return {
        id: raw.id,
        title: raw.title,
        description: raw.description,
        category: parsed.category ?? 'other',
        skills: Array.isArray(parsed.skills)
          ? parsed.skills.map((s: unknown) => String(s))
          : [],
        rewardAmount: raw.rewardAmount,
        estimatedHours: raw.estimatedHours,
        difficulty: Number(parsed.difficulty) || 5,
        cognitiveLoad: Number(parsed.cognitiveLoad) || 5,
        physicalLoad: Number(parsed.physicalLoad) || 1,
        deadline: raw.deadline,
        sourceId: raw.sourceId,
      };
    } catch (err) {
      this.logger.error('[NLP ERROR]', err);

      return {
        id: raw.id,
        title: raw.title,
        description: raw.description,
        category: 'other',
        skills: [],
        rewardAmount: raw.rewardAmount,
        estimatedHours: raw.estimatedHours,
        difficulty: 5,
        cognitiveLoad: 5,
        physicalLoad: 1,
        deadline: raw.deadline,
        sourceId: raw.sourceId,
      };
    }
  }

  // -----------------------------------------------------------------------------
  // 🧩 REASONING
  // -----------------------------------------------------------------------------
  private buildReasoning(
    mission: NormalizedMission,
    score: number,
    wm: ReturnType<typeof calculateWMoonScore>,
  ): string {
    const h: string[] = [];

    if (wm.factors.x1_skillMatch >= 0.7) h.push('forte match skills');
    if (wm.factors.x2_timeEfficiency >= 0.7)
      h.push('ottimo rapporto paga/tempo');
    if (wm.factors.x5_growth >= 0.6) h.push('missione di crescita');
    if (wm.factors.x7_urgency >= 0.7) h.push('alta urgenza');
    if (wm.isScam) h.push(`possibile truffa: ${wm.scamReason}`);

    return `Score: ${score.toFixed(1)}/100 · ${
      h.join(' • ') || 'missione equilibrata'
    }`;
  }
}
