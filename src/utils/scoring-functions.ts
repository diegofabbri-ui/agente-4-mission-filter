// src/utils/scoring-functions.ts

import {
  NormalizedMission,
  UserScoringContext,
  WMoonFactors,
  WMoonWeights,
} from '../types/mission-filter.types';

export interface WMoonScoreResult {
  score: number; // 0-100
  isScam: boolean;
  scamReason?: string;
  factors: WMoonFactors;
}

// -----------------------------
// DEFAULT WEIGHTS
// -----------------------------

export function getDefaultWeights(): WMoonWeights {
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

// -----------------------------
// CORE SCORING
// -----------------------------

export function calculateWMoonScore(
  user: UserScoringContext,
  mission: NormalizedMission,
  weights: WMoonWeights,
  now: Date,
): WMoonScoreResult {
  const scamKeywords = [
    'telegram',
    'whatsapp',
    'security fee',
    'deposit',
    'gift card',
  ];

  // ---------- x1: Skill Match (Jaccard) ----------
  const intersection = sizeOfIntersection(user.skills, mission.skills);
  const union = sizeOfUnion(user.skills, mission.skills);
  const x1 = union > 0 ? intersection / union : 0;

  // ---------- x2: Time Efficiency (Logistic) ----------
  const roti =
    mission.estimatedHours > 0
      ? mission.rewardAmount / mission.estimatedHours
      : 0;
  const avgRate = user.avgHourlyRate > 0 ? user.avgHourlyRate : 15;
  const x2 = logistic(0.5 * (roti - avgRate));

  // ---------- x3: Success Probability (Bayesian) ----------
  const GLOBAL_ALPHA = 5;
  const GLOBAL_BETA = 5;
  const alpha = user.hasHistory ? user.successes : GLOBAL_ALPHA;
  const beta = user.hasHistory ? user.failures : GLOBAL_BETA;
  const x3 = alpha + beta > 0 ? alpha / (alpha + beta) : 0.5;

  // ---------- x4: Scam Detection ----------
  let riskScore = 0;
  const text = `${mission.title} ${mission.description}`.toLowerCase();

  for (const kw of scamKeywords) {
    if (text.includes(kw)) riskScore += 1.0;
  }

  if (mission.rewardAmount > 200 && mission.estimatedHours < 0.5) {
    riskScore += 0.8;
  }

  const x4 = Math.max(0, 1 - riskScore);

  if (x4 < 0.2) {
    // Gatekeeper: truffa → score 0
    return {
      score: 0,
      isScam: true,
      scamReason: 'Pattern di truffa rilevato (keyword o reward anomala)',
      factors: {
        x1_skillMatch: clamp01(x1),
        x2_timeEfficiency: clamp01(x2),
        x3_successProbability: clamp01(x3),
        x4_scam: clamp01(x4),
        x5_growth: 0,
        x6_utility: 0,
        x7_urgency: 0,
        x8_consistency: 0,
        x9_trust: 0.5,
      },
    };
  }

  // ---------- x5: Growth (Flow State Gaussian) ----------
  const gap = mission.difficulty - user.skillLevel;
  const x5 = gaussian(gap - 1.0, 1.5); // centro a +1 sopra il livello

  // ---------- x6: Utility (Logarithmic) ----------
  const effort = mission.cognitiveLoad + mission.physicalLoad;
  const x6 =
    effort >= 0
      ? Math.min(
          1,
          Math.log(1 + mission.rewardAmount) / Math.log(2 + effort),
        )
      : 0.5;

  // ---------- x7: Urgency ----------
  const hoursLeft = (mission.deadline.getTime() - now.getTime()) / 3_600_000;
  let x7: number;
  if (hoursLeft < mission.estimatedHours) {
    x7 = 0; // impossibile finirla
  } else {
    x7 = 1 / (1 + Math.exp(0.2 * (hoursLeft - 24))); // 24h soglia critica
  }

  // ---------- x8: Consistency ----------
  const x8 = Math.tanh(0.1 * user.streakCount);

  // ---------- x9: Trust ----------
  const x9 = user.trustMap[mission.sourceId] ?? 0.5;

  const factors: WMoonFactors = {
    x1_skillMatch: clamp01(x1),
    x2_timeEfficiency: clamp01(x2),
    x3_successProbability: clamp01(x3),
    x4_scam: clamp01(x4),
    x5_growth: clamp01(x5),
    x6_utility: clamp01(x6),
    x7_urgency: clamp01(x7),
    x8_consistency: clamp01(x8),
    x9_trust: clamp01(x9),
  };

  const score =
    (factors.x1_skillMatch * weights.x1_skillMatch +
      factors.x2_timeEfficiency * weights.x2_timeEfficiency +
      factors.x3_successProbability * weights.x3_successProbability +
      factors.x4_scam * weights.x4_scam +
      factors.x5_growth * weights.x5_growth +
      factors.x6_utility * weights.x6_utility +
      factors.x7_urgency * weights.x7_urgency +
      factors.x8_consistency * weights.x8_consistency +
      factors.x9_trust * weights.x9_trust) *
    100;

  return {
    score: clampScore(score),
    isScam: false,
    factors,
  };
}

// -----------------------------
// LEARNING: UPDATE PESI
// -----------------------------

export function updateWMoonWeights(
  current: WMoonWeights,
  factors: WMoonFactors,
  totalScore: number,
  action: 1 | -1,
  learningRate: number,
): WMoonWeights {
  const predicted = totalScore / 100;
  const actual = action === 1 ? 1 : 0;
  const error = actual - predicted;

  const updated: WMoonWeights = { ...current };

  (Object.keys(updated) as (keyof WMoonWeights)[]).forEach((key) => {
    const factorKey = key as keyof WMoonFactors;
    const factorVal = factors[factorKey] ?? 0;
    const delta = learningRate * error * factorVal;
    updated[key] = updated[key] + delta;
  });

  // Non permettere valori negativi
  (Object.keys(updated) as (keyof WMoonWeights)[]).forEach((k) => {
    if (updated[k] < 0) updated[k] = 0;
  });

  // Rinormalizza a somma 1
  const sum =
    updated.x1_skillMatch +
    updated.x2_timeEfficiency +
    updated.x3_successProbability +
    updated.x4_scam +
    updated.x5_growth +
    updated.x6_utility +
    updated.x7_urgency +
    updated.x8_consistency +
    updated.x9_trust;

  if (sum > 0) {
    (Object.keys(updated) as (keyof WMoonWeights)[]).forEach((k) => {
      updated[k] = updated[k] / sum;
    });
  } else {
    return getDefaultWeights();
  }

  // Vincolo di sicurezza: x4_scam >= 0.15
  if (updated.x4_scam < 0.15) {
    const diff = 0.15 - updated.x4_scam;
    updated.x4_scam = 0.15;

    // ridistribuisci il surplus togliendo un po' dagli altri
    const others: (keyof WMoonWeights)[] = [
      'x1_skillMatch',
      'x2_timeEfficiency',
      'x3_successProbability',
      'x5_growth',
      'x6_utility',
      'x7_urgency',
      'x8_consistency',
      'x9_trust',
    ];
    const share = diff / others.length;
    for (const k of others) {
      updated[k] = Math.max(0, updated[k] - share);
    }
  }

  return updated;
}

// -----------------------------
// HELPERS
// -----------------------------

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function gaussian(x: number, sigma: number): number {
  return Math.exp(-(x * x) / (2 * sigma * sigma));
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

function clampScore(s: number): number {
  if (!Number.isFinite(s)) return 0;
  return Math.min(100, Math.max(0, s));
}

function sizeOfIntersection(a: Set<string>, b: string[]): number {
  let count = 0;
  for (const skill of b) {
    if (a.has(skill.toLowerCase())) count++;
  }
  return count;
}

function sizeOfUnion(a: Set<string>, b: string[]): number {
  const tmp = new Set<string>(a);
  for (const skill of b) tmp.add(skill.toLowerCase());
  return tmp.size;
}
