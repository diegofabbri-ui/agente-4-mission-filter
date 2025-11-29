// src/services/ai-profile.service.ts

import type { Kysely } from "kysely";
import type {
  FilteredMission,
  UserAIProfileRow,
  UserMissionHistoryRow,
  WMoonWeights,
} from "../types/mission-filter.types";
import { updateWMoonWeights } from "../utils/scoring-functions";
import type { DB } from "../types/db";

export type MissionOutcome = "accepted" | "rejected" | "completed" | "hidden";

export class UserAIProfileService {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Aggiornamento del profilo AI dell’utente dopo una decisione su una missione.
   */
  async updateProfileAfterMission(
    userId: string,
    mission: FilteredMission,
    outcome: MissionOutcome,
  ): Promise<void> {
    const profile = await this.db
      .selectFrom("user_ai_profile")
      .selectAll()
      .where("user_id", "=", userId)
      .executeTakeFirst();

    if (!profile) return;

    const currentWeights: WMoonWeights =
      (profile.weights as WMoonWeights | null) ?? this.getFallbackWeights();

    // learning_rate è Numeric => string in lettura → lo normalizziamo a number
    const learningRate =
      profile.learning_rate != null
        ? Number(profile.learning_rate as any)
        : 0.05;

    const action: 1 | -1 =
      outcome === "accepted" || outcome === "completed" ? 1 : -1;

    const newWeights = updateWMoonWeights(
      currentWeights,
      mission.factors,
      mission.totalScore,
      action,
      learningRate,
    );

    await this.db
      .updateTable("user_ai_profile")
      .set({
        weights: newWeights as any,
        last_updated: new Date().toISOString(),
      })
      .where("user_id", "=", userId)
      .execute();
  }

  private getFallbackWeights(): WMoonWeights {
    return {
      x1_skillMatch: 0.15,
      x2_timeEfficiency: 0.15,
      x3_successProbability: 0.1,
      x4_scam: 0.2,
      x5_growth: 0.1,
      x6_utility: 0.1,
      x7_urgency: 0.1,
      x8_consistency: 0.05,
      x9_trust: 0.05,
    };
  }
}
