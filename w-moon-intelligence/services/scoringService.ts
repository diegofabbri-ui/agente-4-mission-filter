import { UserProfile, Mission, ScoringBreakdown, Weights } from '../types';

// Parole chiave truffa (Inglese e Italiano)
const SCAM_KEYWORDS = [
  "telegram", "whatsapp", "security fee", "deposit", "gift card", "wiring", "easy money",
  "deposito", "tassa sicurezza", "soldi facili", "guadagno garantito", "ricarica postepay", "bonifico immediato"
];
const GLOBAL_ALPHA = 2; // Default prior success
const GLOBAL_BETA = 2;  // Default prior failure

export const getDefaultWeights = (): Weights => ({
  x1: 0.15, x2: 0.15, x3: 0.10,
  x4: 0.20, x5: 0.10, x6: 0.10,
  x7: 0.10, x8: 0.05, x9: 0.05
});

export const calculateScore = (user: UserProfile, mission: Mission): ScoringBreakdown => {
  const now = new Date();
  
  // Clone user to avoid mutations during calculation (simulating temporary state)
  const effectiveUser = { ...user };

  // --- 1. PRE-PROCESSING (Inactive User) ---
  const daysInactive = (now.getTime() - effectiveUser.lastActiveDate.getTime()) / (1000 * 3600 * 24);
  if (daysInactive > 30) {
    effectiveUser.skillLevel *= 0.9;
    effectiveUser.streakCount = 0;
  }

  // --- 2. FACTOR CALCULATION ---

  // x1: Skill Match (Jaccard Index)
  const userSkillsSet = new Set(effectiveUser.skills.map(s => s.toLowerCase()));
  const missionSkillsSet = new Set(mission.skillsRequired.map(s => s.toLowerCase()));
  
  const intersection = new Set([...userSkillsSet].filter(x => missionSkillsSet.has(x)));
  const union = new Set([...userSkillsSet, ...missionSkillsSet]);
  
  const x1 = union.size > 0 ? intersection.size / union.size : 0;

  // x2: Time Efficiency (Logistic Function)
  // ROTI: Return on Time Invested
  const roti = mission.estTime > 0 ? mission.reward / mission.estTime : 0;
  const avgRate = effectiveUser.avgHourlyRate > 0 ? effectiveUser.avgHourlyRate : 15.0;
  // Sigmoid centered around avgRate
  const x2 = 1 / (1 + Math.exp(-0.5 * (roti - avgRate)));

  // x3: Success Probability (Bayesian)
  const hasHistory = (effectiveUser.successes + effectiveUser.failures) > 0;
  const alpha = hasHistory ? effectiveUser.successes : GLOBAL_ALPHA;
  const beta = hasHistory ? effectiveUser.failures : GLOBAL_BETA;
  const x3 = alpha / (alpha + beta);

  // x4: Scam Detection (Firewall)
  let riskScore = 0;
  const textBody = (mission.title + " " + mission.description).toLowerCase();
  
  // Rule 1: Keywords
  for (const word of SCAM_KEYWORDS) {
    if (textBody.includes(word)) riskScore += 1.0;
  }

  // Rule 2: High Reward / Low Effort Anomaly (Too good to be true)
  if (mission.reward > 200 && mission.estTime < 0.5) {
    riskScore += 0.8;
  }

  const x4 = Math.max(0, 1 - riskScore);

  // SECURITY GATEKEEPER
  if (x4 < 0.2) {
    return {
      finalScore: 0,
      factors: { x1, x2, x3, x4, x5: 0, x6: 0, x7: 0, x8: 0, x9: 0 },
      isRejected: true,
      rejectionReason: "RIFIUTATO_SICUREZZA: Rilevato alto rischio truffa."
    };
  }

  // x5: Growth (Flow State)
  // Optimal gap = +1 (slightly above current skill)
  const gap = mission.difficulty - effectiveUser.skillLevel;
  // Gaussian curve peaking at gap = 1
  const x5 = Math.exp(-Math.pow(gap - 1.0, 2) / (2 * Math.pow(1.5, 2)));

  // x6: Utility (Logarithmic)
  const effort = mission.cognitiveLoad + mission.physicalLoad;
  const x6 = Math.log(1 + mission.reward) / Math.log(1 + effort + 2); // +2 to avoid div by 0 or 1 log issues

  // x7: Urgency
  const msLeft = mission.deadline.getTime() - now.getTime();
  const hoursLeft = msLeft / (1000 * 3600);
  // Logistic decay: value increases as deadline approaches, but drops if passed
  const x7 = hoursLeft < 0 ? 0 : 1 / (1 + Math.exp(0.2 * (hoursLeft - 24)));

  // x8: Consistency (Tanh)
  const x8 = Math.tanh(0.1 * effectiveUser.streakCount);

  // x9: Trust
  const x9 = effectiveUser.trustMap[mission.source] ?? 0.5;

  // --- 3. AGGREGATION ---
  const w = effectiveUser.weights;
  
  const rawScore = 
    (x1 * w.x1) +
    (x2 * w.x2) +
    (x3 * w.x3) +
    (x4 * w.x4) +
    (x5 * w.x5) +
    (x6 * w.x6) +
    (x7 * w.x7) +
    (x8 * w.x8) +
    (x9 * w.x9);

  return {
    finalScore: rawScore * 100,
    factors: { x1, x2, x3, x4, x5, x6, x7, x8, x9 },
    isRejected: false
  };
};