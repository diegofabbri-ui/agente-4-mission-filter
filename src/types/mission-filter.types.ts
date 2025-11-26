// src/types/mission-filter.types.ts

export type WMoonFactorKey =
  | 'x1_skillMatch'
  | 'x2_timeEfficiency'
  | 'x3_successProbability'
  | 'x4_scam'
  | 'x5_growth'
  | 'x6_utility'
  | 'x7_urgency'
  | 'x8_consistency'
  | 'x9_trust';

// Tutti i fattori: key → number
export type WMoonFactors = Record<WMoonFactorKey, number>;

export type WMoonWeights = Record<WMoonFactorKey, number>;

export interface UserAIProfileRow {
  user_id: string;
  skill_vector: Record<string, number> | null;
  weights: WMoonWeights | null;
  learning_rate: number;
  risk_tolerance: number | null;
  beta_stats: { alpha: number; beta: number } | null;
  last_updated: string;
}

export interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  last_active_at: string;
  status: 'active' | 'banned' | 'inactive';
}

export interface UserMissionHistoryRow {
  id: string;
  user_id: string;
  mission_id: string;
  action: 'viewed' | 'accepted' | 'rejected' | 'completed' | 'hidden';
  feedback_rating: number | null;
  action_timestamp: string;
}

export interface MissionFilterRow {
  id: string;
  mission_id: string;
  user_id: string;
  total_score: number;
  factors_breakdown: WMoonFactors;
  is_scam: boolean;
  scam_reason: string | null;
  calculated_at: string;
}

export interface AIAuditLogRow {
  id: string;
  user_id: string;
  mission_id: string;
  decision_type: 'SCAM_BLOCK' | 'HIGH_SCORE' | 'WEIGHT_UPDATE' | 'INFO';
  explanation: string;
  snapshot_weights: WMoonFactors | null;
  created_at: string;
}

// ----- RAW MISSION -----
export interface RawMissionInput {
  id: string;
  title: string;
  description: string;
  sourceUrl?: string;
  rewardAmount: number;
  estimatedHours: number;
  deadline: Date;
  sourceId: string;
}

// ----- NORMALIZED MISSION -----
export interface NormalizedMission {
  id: string;
  title: string;
  description: string;
  category: string;
  skills: string[];
  rewardAmount: number;
  estimatedHours: number;
  difficulty: number;
  cognitiveLoad: number;
  physicalLoad: number;
  deadline: Date;
  sourceId: string;
}

// ----- USER SCORING CONTEXT -----
export interface UserScoringContext {
  userId: string;
  skills: Set<string>;
  avgHourlyRate: number;
  skillLevel: number;
  lastActiveAt: Date;
  streakCount: number;
  hasHistory: boolean;
  successes: number;
  failures: number;
  trustMap: Record<string, number>;
  weights: WMoonWeights;
  learningRate: number;
}

// ----- FINAL FILTERED OUTPUT -----
export interface FilteredMission {
  missionId: string;
  userId: string;
  totalScore: number;
  isScam: boolean;
  scamReason?: string;
  factors: WMoonFactors;
  reasoning: string;
  normalizedMission: NormalizedMission;
}
