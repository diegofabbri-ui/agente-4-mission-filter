class W_Moon_Engine:
    def __init__(self, user_profile):
        self.user = user_profile
        self.weights = user_profile.weights or self.get_default_weights()
        self.scam_keywords = ["telegram", "whatsapp", "security fee", "deposit", "gift card"]

    def get_default_weights(self):
        # Profilo bilanciato per nuovi utenti
        return {
            'x1': 0.15, 'x2': 0.15, 'x3': 0.10, 
            'x4': 0.20, 'x5': 0.10, 'x6': 0.10, 
            'x7': 0.10, 'x8': 0.05, 'x9': 0.05
        }

    def calculate_score(self, mission):
        # --- 1. GESTIONE CASI LIMITE (Pre-Processing) ---
        
        # Caso: Utente Inattivo (> 30 giorni)
        # Decadimento skill e reset momentum
        if (self.user.last_active_date - current_date).days > 30:
            self.user.skill_level *= 0.9  # Skill decay [cite: 196]
            self.user.streak_count = 0    # Reset consistency

        # Caso: Cold Start (Nuovo Utente)
        # Usa prior Bayesiani globali per x3 se history è vuota [cite: 68, 185]
        user_alpha = self.user.successes if self.user.has_history else GLOBAL_ALPHA
        user_beta = self.user.failures if self.user.has_history else GLOBAL_BETA

        # --- 2. CALCOLO FATTORI ---
        
        # x1: Skill Match (Jaccard)
        intersection = len(self.user.skills.intersection(mission.skills))
        union = len(self.user.skills.union(mission.skills))
        x1 = intersection / union if union > 0 else 0

        # x2: Time Efficiency (Logistic)
        roti = mission.reward / mission.est_time
        avg_rate = self.user.avg_hourly_rate if self.user.avg_hourly_rate > 0 else 15.0
        x2 = 1 / (1 + math.exp(-0.5 * (roti - avg_rate)))

        # x3: Success Probability (Bayesian)
        x3 = user_alpha / (user_alpha + user_beta)

        # x4: Scam Detection (Firewall) [cite: 88, 152]
        risk_score = 0
        text_body = (mission.title + " " + mission.description).lower()
        
        # Rule 1: Keywords
        for word in self.scam_keywords:
            if word in text_body: risk_score += 1.0 # Fatal
            
        # Rule 2: High Reward / Low Effort Anomaly
        if mission.reward > 200 and mission.est_time < 0.5:
            risk_score += 0.8
            
        x4 = max(0, 1 - risk_score)
        
        # GATEKEEPER DI SICUREZZA
        if x4 < 0.2:
            return 0.0, "REJECTED_SAFETY"

        # x5: Growth (Flow State)
        # Optimal gap = +1 (leggermente sopra skill attuale)
        gap = mission.difficulty - self.user.skill_level
        x5 = math.exp(-((gap - 1.0)**2) / (2 * (1.5**2)))

        # x6: Utility (Logarithmic)
        effort = mission.cognitive_load + mission.physical_load
        x6 = math.log(1 + mission.reward) / math.log(1 + effort + 1)

        # x7: Urgency
        hours_left = (mission.deadline - current_time).hours
        x7 = 1 / (1 + math.exp(0.2 * (hours_left - 24))) # 24h critical threshold

        # x8: Consistency
        x8 = math.tanh(0.1 * self.user.streak_count)

        # x9: Trust
        x9 = self.user.trust_map.get(mission.source, 0.5) # Default 0.5

        # --- 3. AGGREGAZIONE ---
        factors = [x1, x2, x3, x4, x5, x6, x7, x8, x9]
        weights_ordered = [self.weights['x1'], self.weights['x2'], ...] # etc
        
        raw_score = sum(f * w for f, w in zip(factors, weights_ordered))
        final_score = raw_score * 100

        return final_score, factors

        def update_weights(user, mission, action):
    """
    action: 1 (Accepted), -1 (Rejected/Hidden)
    learning_rate: 0.05
    """
    predicted_value = mission.final_score / 100.0
    actual_value = 1.0 if action == 1 else 0.0
    
    error = actual_value - predicted_value
    
    # Aggiorna ogni peso basandosi sul contributo del fattore
    # W_new = W_old + lr * error * factor_value
    
    for i in range(9):
        factor_val = mission.factors[i]
        delta = LEARNING_RATE * error * factor_val
        
        # Applica aggiornamento
        user.weights[i] += delta
    
    # Rinormalizza i pesi affinché la somma sia 1
    total_w = sum(user.weights)
    user.weights = [w / total_w for w in user.weights]
    
    # Vincoli di sicurezza (Hard Constraints)
    # Non permettere mai che il peso sicurezza scenda troppo
    user.weights[3] = max(user.weights[3], 0.15) [cite: 181]

    # ========== TEST CASES PER VERIFICARE ALGORITHM ==========

print("\n" + "="*80)
print("TEST SUITE: W-MOON Algorithm Verification")
print("="*80 + "\n")

# Test Case 1: Missione PERFETTA per l'utente
print("TEST #1: Perfect Match Mission")
mission_perfect = Mission(
    101, "Senior Python Project", 
    "Build scalable Python backend with async/await. No red flags.",
    "coding", ['python', 'async', 'backend'], 500, 5.0, 8.0, 72, "trusted_src", []
)
score_perfect, factors_perfect = recommender.calculate_score(mission_perfect, user)
print(f"Score: {score_perfect:.1f}/100")
print(f"Expected: >85 | Actual: {'PASS ✅' if score_perfect > 85 else 'FAIL ❌'}\n")

# Test Case 2: Missione TRUFFA
print("TEST #2: Scam Detection")
mission_scam = Mission(
    102, "Easy Money Telegram",
    "Send $50 deposit via telegram to start earning $5000/week. Guaranteed!",
    "admin", ['english'], 5000, 0.5, 1.0, 24, "unknown_src", []
)
score_scam, factors_scam = recommender.calculate_score(mission_scam, user)
print(f"Score: {score_scam:.1f}/100")
print(f"Expected: 0.0 | Actual: {'PASS ✅' if score_scam == 0.0 else 'FAIL ❌'}\n")

# Test Case 3: Missione CRESCITA
print("TEST #3: Growth Opportunity")
mission_growth = Mission(
    103, "Rust Systems Programming",
    "Build a small Rust CLI tool. Learning opportunity.",
    "coding", ['rust'], 50, 3.0, 8.5, 72, "trusted_src", []
)
score_growth, factors_growth = recommender.calculate_score(mission_growth, user)
print(f"Score: {score_growth:.1f}/100")
print(f"Expected: 40-60 | Actual: {'PASS ✅' if 40 <= score_growth <= 60 else 'FAIL ❌'}\n")

# Test Case 4: Missione URGENTE
print("TEST #4: Urgent Deadline")
mission_urgent = Mission(
    104, "Quick Python Bug Fix",
    "Fix critical bug in production code. Must be done in 3 hours.",
    "coding", ['python', 'debugging'], 80, 1.0, 3.0, 3.0, "trusted_src", []
)
score_urgent, factors_urgent = recommender.calculate_score(mission_urgent, user)
print(f"Score: {score_urgent:.1f}/100")
print(f"Expected: 70-90 | Actual: {'PASS ✅' if 70 <= score_urgent <= 90 else 'FAIL ❌'}\n")

# Test Case 5: Missione FACILE
print("TEST #5: Too Easy (Low Growth)")
mission_easy = Mission(
    105, "Data Entry Admin Task",
    "Copy data from PDF to Excel spreadsheet.",
    "admin", ['excel', 'data_entry'], 15, 1.5, 1.0, 48, "trusted_src", []
)
score_easy, factors_easy = recommender.calculate_score(mission_easy, user)
print(f"Score: {score_easy:.1f}/100")
print(f"Expected: <50 | Actual: {'PASS ✅' if score_easy < 50 else 'FAIL ❌'}\n")

# ========== VERIFICATION SUMMARY ==========
print("="*80)
print("ALGORITHM VERIFICATION SUMMARY")
print("="*80)

all_scores = [score_perfect, score_scam, score_growth, score_urgent, score_easy]
print(f"\nScores Range: {min(all_scores):.1f} - {max(all_scores):.1f}")
print(f"All scores between 0-100? {'YES ✅' if all(0 <= s <= 100 for s in all_scores) else 'NO ❌'}")
print(f"Diversity (scores are different)? {'YES ✅' if len(set([round(s) for s in all_scores])) > 3 else 'NO ❌'}")
print(f"\nAlgorithm Status: {'READY FOR PRODUCTION ✅' if score_scam == 0.0 and score_perfect > 85 else 'NEEDS ADJUSTMENT ⚠️'}")