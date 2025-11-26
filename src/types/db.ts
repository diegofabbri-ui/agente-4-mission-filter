// src/types/db.ts

import {
  UserRow,
  UserAIProfileRow,
  UserMissionHistoryRow,
  MissionFilterRow,
  AIAuditLogRow,
} from "./mission-filter.types";

/**
 * Tipi della tabella earnings
 */
export interface EarningsRow {
  id: string;
  user_id: string;
  mission_id: string | null;
  amount: number;
  status: string;
  received_at: string | null;
}

/**
 * Struttura tipizzata del database per Kysely.
 */
export interface DB {
  users: UserRow;

  missions: {
    id: string;
    title: string;
    description: string | null;
    reward_amount: number | null;
    estimated_duration_hours: number | null;
    deadline: string | null;
    source_url: string | null;
    created_at: string;
  };

  mission_filters: {
    id: string;
    mission_id: string;
    user_id: string;
    total_score: number;
    factors_breakdown: Record<string, number>;
    is_scam: boolean;
    scam_reason: string | null;
    calculated_at: string;
  };

  ai_audit_log: {
    id: string;
    user_id: string;
    mission_id: string;
    decision_type: "SCAM_BLOCK" | "HIGH_SCORE" | "WEIGHT_UPDATE" | "INFO";
    explanation: string;
    snapshot_weights: Record<string, number> | null;
    created_at: string;
  };

  user_ai_profile: UserAIProfileRow;

  user_mission_history: UserMissionHistoryRow;

  earnings: EarningsRow;
}
