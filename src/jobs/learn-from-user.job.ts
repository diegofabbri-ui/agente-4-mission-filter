// src/jobs/learn-from-user.job.ts

import { db } from "../infra/db";
import { AILearningService } from "../services/ai-learning.service";

async function runJob() {
  console.log("[LEARNING JOB] Starting run...");

  const service = new AILearningService(db);

  const results = await service.runLearningForAllUsers();

  for (const r of results) {
    console.log(
      `[LEARNING] user=${r.userId} sample=${r.metrics.sampleSize} rating=${r.metrics.avgRating} corr=${r.metrics.scoreRatingCorrelation} quality=${r.metrics.qualityLabel}`
    );
  }

  console.log("[LEARNING JOB] Completed.");
}

if (require.main === module) {
  runJob().catch(err => {
    console.error("[LEARNING JOB] Error:", err);
    process.exit(1);
  });
}
