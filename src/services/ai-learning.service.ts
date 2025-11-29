// src/services/ai-learning.service.ts

import { Kysely } from "kysely";
import { DB } from "../types/db";
import {
  MissionOutcome,
  AccuracyMetrics,
  computeAccuracyMetrics,
} from "../utils/accuracy-metrics";

export class AILearningService {
  constructor(private db: Kysely<DB>) {}

  async getOutcomesForUser(
    userId: string,
    windowDays = 30
  ): Promise<MissionOutcome[]> {
    const since = new Date();
    since.setDate(since.getDate() - windowDays);

    const rows = await this.db
      .selectFrom("user_mission_history as h")
      .innerJoin("missions as m", "m.id", "h.mission_id")
      .innerJoin("mission_filters as f", "f.mission_id", "h.mission_id")
      .select((eb) => [
        eb.ref("h.mission_id").as("missionId"),
        eb.ref("h.user_id").as("userId"),
        eb.ref("f.total_score").as("score"),
        eb.ref("h.action").as("action"),
        eb.ref("h.feedback_rating").as("rating"),
        eb.ref("h.action_timestamp").as("timestamp"),
      ])
      .where("h.user_id", "=", userId)
      .where("h.action_timestamp", ">=", since)
      .execute();

    return rows.map((r) => ({
      missionId: r.missionId as string,
      userId: r.userId as string,
      score: Number(r.score),
      action: r.action,
      rating: r.rating,
      timestamp: r.timestamp ? new Date(r.timestamp as any) : null,
    }));
  }

  async runLearningForUser(userId: string): Promise<AccuracyMetrics> {
    const outcomes = await this.getOutcomesForUser(userId);
    const metrics = computeAccuracyMetrics(outcomes);

    // ai_audit_log: inseriamo solo i campi realmente richiesti dal tipo
    await this.db
      .insertInto("ai_audit_log")
      .values({
        user_id: userId,
        mission_id: null,
        decision_type: "INFO",
        explanation: JSON.stringify(metrics),
        snapshot_weights: null,
      })
      .execute();

    return metrics;
  }

  async runLearningForAllUsers(): Promise<
    { userId: string; metrics: AccuracyMetrics }[]
  > {
    const users = await this.db
      .selectFrom("users")
      .select("id")
      .execute();

    const results: { userId: string; metrics: AccuracyMetrics }[] = [];

    for (const u of users) {
      const metrics = await this.runLearningForUser(u.id);
      results.push({ userId: u.id, metrics });
    }

    return results;
  }
}
