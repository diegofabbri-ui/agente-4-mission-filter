// src/utils/accuracy-metrics.ts

export interface MissionOutcome {
  missionId: string;
  userId: string;
  score: number;
  action: string | null;
  rating: number | null;
  timestamp: Date | null;
}

export interface AccuracyMetrics {
  sampleSize: number;
  acceptanceRate: number;
  completionRate: number;
  avgRating: number | null;
  scoreRatingCorrelation: number | null;
  qualityLabel: "LOW" | "MEDIUM" | "HIGH";
}

export function computeAccuracyMetrics(outcomes: MissionOutcome[]): AccuracyMetrics {
  const sampleSize = outcomes.length;
  if (sampleSize === 0) {
    return {
      sampleSize,
      acceptanceRate: 0,
      completionRate: 0,
      avgRating: null,
      scoreRatingCorrelation: null,
      qualityLabel: "LOW",
    };
  }

  const accepted = outcomes.filter(o => o.action === "accepted").length;
  const completed = outcomes.filter(o => o.action === "completed").length;

  const ratings = outcomes.filter(o => o.rating !== null).map(o => o.rating!);
  const scores = outcomes.map(o => o.score);

  const avgRating = ratings.length ? ratings.reduce((a,b)=>a+b,0) / ratings.length : null;

  const scoreRatingCorrelation =
    ratings.length >= 3 ? pearsonCorrelation(scores, ratings) : null;

  const qualityLabel =
    scoreRatingCorrelation !== null && scoreRatingCorrelation > 0.4
      ? "HIGH"
      : scoreRatingCorrelation !== null && scoreRatingCorrelation > 0.1
      ? "MEDIUM"
      : "LOW";

  return {
    sampleSize,
    acceptanceRate: accepted / sampleSize,
    completionRate: completed / sampleSize,
    avgRating,
    scoreRatingCorrelation,
    qualityLabel,
  };
}

function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 3) return null;

  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return null;

  return num / Math.sqrt(denX * denY);
}
