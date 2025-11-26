export interface Weights {
  x1: number; // Skill Match
  x2: number; // Time Efficiency
  x3: number; // Success Probability
  x4: number; // Scam Detection
  x5: number; // Growth
  x6: number; // Utility
  x7: number; // Urgency
  x8: number; // Consistency
  x9: number; // Trust
}

export interface UserProfile {
  id: string;
  name: string;
  skills: string[];
  weights: Weights;
  lastActiveDate: Date;
  avgHourlyRate: number;
  successes: number;
  failures: number;
  streakCount: number;
  trustMap: Record<string, number>; // Source -> Trust Score (0-1)
  skillLevel: number; // 1-10
}

export interface Mission {
  id: string | number;
  title: string;
  description: string;
  category: string;
  skillsRequired: string[];
  reward: number; // Monetary value
  estTime: number; // Hours
  difficulty: number; // 1-10
  deadline: Date;
  source: string;
  cognitiveLoad: number; // 1-10
  physicalLoad: number; // 1-10
}

export interface ScoringBreakdown {
  finalScore: number;
  factors: {
    x1: number;
    x2: number;
    x3: number;
    x4: number;
    x5: number;
    x6: number;
    x7: number;
    x8: number;
    x9: number;
  };
  isRejected: boolean;
  rejectionReason?: string;
}

export interface ScoredMission extends Mission {
  score: ScoringBreakdown;
}