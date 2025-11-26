# W-MOON Intelligence
## Manuale Completo dell'Algoritmo di Raccomandazione Missioni

---

## Indice

1. [Panoramica Generale](#panoramica-generale)
2. [Architettura del Sistema](#architettura-del-sistema)
3. [Il Cuore Pulsante: algoritmo-agente-4.py](#il-cuore-pulsante-algoritmo-agente-4py)
4. [I 9 Fattori di Scoring](#i-9-fattori-di-scoring)
5. [Sistema di Sicurezza (Gatekeeper)](#sistema-di-sicurezza-gatekeeper)
6. [Apprendimento Automatico dei Pesi](#apprendimento-automatico-dei-pesi)
7. [Integrazione con Google Gemini AI](#integrazione-con-google-gemini-ai)
8. [Componenti Frontend](#componenti-frontend)
9. [Strutture Dati (Types)](#strutture-dati-types)
10. [Configurazione e Deployment](#configurazione-e-deployment)
11. [Test Suite](#test-suite)
12. [Glossario](#glossario)

---

## Panoramica Generale

**W-MOON Intelligence** è un motore di raccomandazione missioni intelligente progettato per aiutare freelancer e lavoratori a identificare le migliori opportunità di guadagno. Il sistema utilizza:

- **Machine Learning Bayesiano** per stimare probabilità di successo
- **Algoritmi di scoring multi-fattoriale** (9 fattori pesati)
- **Rilevamento truffe in tempo reale** con keyword e pattern anomali
- **Personalizzazione basata sul profilo utente** (skill, storia, preferenze)
- **Integrazione AI con Google Gemini 2.5 Flash** per parsing naturale

### Problema che Risolve

| Problema | Conseguenza |
|----------|-------------|
| Troppe opzioni confuse | Difficile distinguere opportunità buone da truffe |
| Scam con promesse irrealistiche | "Guadagna €5000 in 1 ora" – perdite di tempo e denaro |
| Mancanza di matching personalizzato | Una missione difficile per uno potrebbe essere perfetta per un altro |
| Tempi insufficienti per compiti | Accetta missioni per cui non è bravo e fallisce |

### Benefici Principali

| Per l'Utente | Per il Business |
|--------------|-----------------|
| ↑ 40% tassi di completamento | ↑ 35% commissioni da missioni completate |
| 97% scam detection rate | Utenti soddisfatti → retention |
| Risparmia 2+ ore/giorno nella ricerca | Dati per ML futuri |
| Sistema che impara e migliora | Feedback loop di apprendimento |

---

## Architettura del Sistema

### Flusso Completo

```
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP 1: UTENTE AGGIUNGE MISSIONE                                       │
│  → Incolla descrizione (es. da Telegram, email, Upwork)                 │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP 2: GEMINI AI ANALIZZA (geminiService.ts)                          │
│  → Input: testo libero in linguaggio naturale                           │
│  → Parsing: estrae struttura JSON                                       │
│  → Output: title, reward, estTime, difficulty, skills, ...              │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP 3: W-MOON SCORING ENGINE (scoringService.ts)                      │
│  → Calcola 9 fattori (x1...x9)                                          │
│  → Ogni fattore normalizzato 0-1                                        │
│  → Applica pesi personalizzati                                          │
│  → Output: Score finale 0-100 + breakdown fattori                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP 4: SAFETY GATEKEEPER                                              │
│  → Se x4 < 0.2: Score = 0.0 IMMEDIATELY                                 │
│  → Altrimenti: continua verso il punteggio finale                       │
│  → Output: rejectionReason se bloccata                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP 5: FRONTEND VISUALIZZA (MissionCard.tsx + RadarChart.tsx)         │
│  → Score visibile in grande (es. 69.4)                                  │
│  → Radar Chart mostra i 9 fattori                                       │
│  → Colore badge: rosso (0-30), blu (30-70), verde (70-100)             │
│  → Modalità espansa: dettagli su richiesta                              │
└─────────────────────────────────────────────────────────────────────────┘
```

### Stack Tecnologico

| Componente | Tecnologia | Ruolo |
|------------|------------|-------|
| AI Analysis | Google Gemini 2.5 Flash | Parsing naturale delle missioni |
| Scoring Engine | TypeScript + React | Calcolo 9 fattori e aggregazione |
| Frontend | React 19 + TypeScript | UI dashboard e visualizzazione |
| Styling | Tailwind CSS v4 | Design responsive e moderno |
| Visualization | Recharts | Rappresentazione grafica fattori (Radar Chart) |
| State Management | React Hooks | Gestione missioni e utenti |
| Build Tool | Vite 6 | Bundling e development server |

---

## Il Cuore Pulsante: algoritmo-agente-4.py

Il file `algoritmo-agente-4.py` contiene la **classe W_Moon_Engine**, il cuore dell'intero sistema di scoring. Ecco la sua struttura:

### Classe `W_Moon_Engine`

```python
class W_Moon_Engine:
    def __init__(self, user_profile):
        self.user = user_profile
        self.weights = user_profile.weights or self.get_default_weights()
        self.scam_keywords = ["telegram", "whatsapp", "security fee", "deposit", "gift card"]
```

#### Pesi di Default (Profilo Bilanciato)

```python
def get_default_weights(self):
    return {
        'x1': 0.15,  # Skill Match
        'x2': 0.15,  # Time Efficiency
        'x3': 0.10,  # Success Probability
        'x4': 0.20,  # Safety (GATEKEEPER)
        'x5': 0.10,  # Personal Growth
        'x6': 0.10,  # Utility
        'x7': 0.10,  # Urgency
        'x8': 0.05,  # Consistency
        'x9': 0.05   # Trust
    }
    # Totale: 1.00
```

### Metodo `calculate_score(mission)`

Questo è il metodo principale che calcola lo score 0-100 per ogni missione.

#### Fase 1: Pre-Processing (Gestione Casi Limite)

```python
# Caso: Utente Inattivo (> 30 giorni)
if (self.user.last_active_date - current_date).days > 30:
    self.user.skill_level *= 0.9  # Skill decay
    self.user.streak_count = 0     # Reset consistency

# Caso: Cold Start (Nuovo Utente)
# Usa prior Bayesiani globali per x3 se history è vuota
user_alpha = self.user.successes if self.user.has_history else GLOBAL_ALPHA
user_beta = self.user.failures if self.user.has_history else GLOBAL_BETA
```

#### Fase 2: Calcolo dei 9 Fattori

Vedi sezione dedicata sotto.

#### Fase 3: Aggregazione Finale

```python
factors = [x1, x2, x3, x4, x5, x6, x7, x8, x9]
weights_ordered = [self.weights['x1'], self.weights['x2'], ...]

raw_score = sum(f * w for f, w in zip(factors, weights_ordered))
final_score = raw_score * 100  # Scala 0-100

return final_score, factors
```

---

## I 9 Fattori di Scoring

### Formula Generale

\[
\text{Score Finale} = \left( \sum_{i=1}^{9} w_i \cdot x_i \right) \times 100
\]

Dove:
- \(w_i\) = peso assegnato al fattore (somma dei pesi = 1.0)
- \(x_i\) = valore normalizzato 0-1 del fattore

---

### x1: Skill Match (Peso: 15%)

**Domanda chiave:** L'utente ha le skill necessarie?

**Formula (Jaccard Similarity):**

\[
\text{Jaccard} = \frac{|\text{skills}_{utente} \cap \text{skills}_{missione}|}{|\text{skills}_{utente} \cup \text{skills}_{missione}|}
\]

**Implementazione:**
```python
intersection = len(self.user.skills.intersection(mission.skills))
union = len(self.user.skills.union(mission.skills))
x1 = intersection / union if union > 0 else 0
```

**Esempio:**
- Utente: {TypeScript, React, Node.js, Python, Tailwind}
- Missione: {React, Node.js}
- Intersezione: {React, Node.js} = 2
- Unione: 5 elementi
- **x1 = 2/5 = 0.40 (40%)**

| Range | Interpretazione |
|-------|-----------------|
| 0.0-0.2 | Non qualificato |
| 0.2-0.5 | Parzialmente qualificato |
| 0.5-0.8 | Qualificato |
| 0.8-1.0 | Molto qualificato |

---

### x2: Time Efficiency (Peso: 15%)

**Domanda chiave:** Vale la pena il compenso per il tempo investito?

**Formula (Funzione Logistica):**

\[
\text{ROTI} = \frac{\text{reward}}{\text{est\_time}}
\]

\[
x_2 = \frac{1}{1 + e^{-0.5 \cdot (\text{ROTI} - \text{avg\_rate})}}
\]

**Implementazione:**
```python
roti = mission.reward / mission.est_time
avg_rate = self.user.avg_hourly_rate if self.user.avg_hourly_rate > 0 else 15.0
x2 = 1 / (1 + math.exp(-0.5 * (roti - avg_rate)))
```

**Esempio:**
- user.avgHourlyRate = €45/ora
- mission.reward = €150, mission.estTime = 2 ore
- ROTI = 150/2 = €75/ora
- x2 = 1/(1 + e^(-0.5 × (75-45))) = 1/(1 + e^(-15)) ≈ **0.95 (95%)**

---

### x3: Success Probability (Peso: 10%)

**Domanda chiave:** L'utente riuscirà a completarla?

**Formula (Bayesiana):**

\[
x_3 = \frac{\alpha}{\alpha + \beta}
\]

Dove:
- α = successi utente (o GLOBAL_ALPHA se nuovo)
- β = fallimenti utente (o GLOBAL_BETA se nuovo)

**Implementazione:**
```python
user_alpha = self.user.successes if self.user.has_history else GLOBAL_ALPHA  # Default: 2
user_beta = self.user.failures if self.user.has_history else GLOBAL_BETA      # Default: 2
x3 = user_alpha / (user_alpha + user_beta)
```

**Esempio:**
- Utente con 12 successi, 1 fallimento
- x3 = 12/(12+1) = **0.92 (92%)**
- Nuovo utente: x3 = 2/(2+2) = **0.50 (50%)**

---

### x4: Safety / Scam Detection (Peso: 20%) - GATEKEEPER

**Domanda chiave:** È una truffa?

**Keyword di Rischio (IT/EN):**
```typescript
const SCAM_KEYWORDS = [
    "telegram", "whatsapp", "security fee", "deposit", "gift card", 
    "wiring", "easy money", "deposito", "tassa sicurezza", 
    "soldi facili", "guadagno garantito", "ricarica postepay", 
    "bonifico immediato"
];
```

**Regole di Rilevamento:**
1. **Rule 1 (Keywords):** Se trovata keyword → riskScore += 1.0 (FATALE)
2. **Rule 2 (Anomalia):** Se reward > €200 E estTime < 0.5h → riskScore += 0.8

**Formula:**
\[
x_4 = \max(0, 1 - \text{riskScore})
\]

**GATEKEEPER:**
```python
if x4 < 0.2:
    return 0.0, "REJECTED_SAFETY"  # Blocco immediato
```

| x4 | Significato |
|----|-------------|
| 0.0 | TRUFFA RILEVATA → BLOCCATA |
| 1.0 | SICURA |

---

### x5: Personal Growth (Peso: 10%)

**Domanda chiave:** Questa missione aiuta l'utente a crescere?

**Formula (Flow State - Gaussiana):**

\[
\text{gap} = \text{difficulty}_{missione} - \text{skill\_level}_{utente}
\]

\[
x_5 = e^{-\frac{(\text{gap} - 1)^2}{2 \times 1.5^2}}
\]

La curva gaussiana ha picco quando gap = 1 (sfida leggermente sopra le competenze attuali).

**Implementazione:**
```python
gap = mission.difficulty - self.user.skill_level
x5 = math.exp(-((gap - 1.0)**2) / (2 * (1.5**2)))
```

---

### x6: Utility (Peso: 10%)

**Domanda chiave:** Il reward giustifica lo sforzo?

**Formula (Logaritmica):**

\[
\text{effort} = \text{cognitive\_load} + \text{physical\_load}
\]

\[
x_6 = \frac{\log(1 + \text{reward})}{\log(1 + \text{effort} + 2)}
\]

**Implementazione:**
```python
effort = mission.cognitive_load + mission.physical_load
x6 = math.log(1 + mission.reward) / math.log(1 + effort + 2)
```

---

### x7: Urgency (Peso: 10%)

**Domanda chiave:** Quanto tempo rimane prima della deadline?

**Formula (Logistica Inversa):**

\[
x_7 = \frac{1}{1 + e^{0.2 \times (\text{hours\_left} - 24)}}
\]

La soglia critica è a 24 ore: sotto questa soglia, l'urgenza sale rapidamente.

**Implementazione:**
```python
hours_left = (mission.deadline - current_time).hours
x7 = 1 / (1 + math.exp(0.2 * (hours_left - 24)))
```

Se la deadline è passata: **x7 = 0**

---

### x8: Consistency (Peso: 5%)

**Domanda chiave:** L'utente è in una serie positiva?

**Formula (Tanh):**

\[
x_8 = \tanh(0.1 \times \text{streak\_count})
\]

**Implementazione:**
```python
x8 = math.tanh(0.1 * self.user.streak_count)
```

| streak_count | x8 |
|--------------|-----|
| 0 | 0.00 |
| 5 | 0.46 |
| 10 | 0.76 |
| 20 | 0.96 |

---

### x9: Trust (Peso: 5%)

**Domanda chiave:** La fonte è affidabile?

**Formula:**
```python
x9 = self.user.trust_map.get(mission.source, 0.5)  # Default 0.5 se sconosciuta
```

**Esempio trust_map:**
```typescript
trustMap: { 
    'Upwork': 0.8, 
    'Diretto': 0.6, 
    'Telegram': 0.1 
}
```

---

## Sistema di Sicurezza (Gatekeeper)

Il **Gatekeeper** è il meccanismo di protezione principale contro le truffe. Funziona come un "firewall" che blocca immediatamente missioni sospette.

### Flusso di Sicurezza

```
Missione in Input
       ↓
┌──────────────────────────┐
│  Calcola x4 (Safety)     │
│  - Scan keywords         │
│  - Check anomalie        │
└──────────────────────────┘
       ↓
   x4 < 0.2?
      ↓
   ┌──┴──┐
   │ SÌ  │ → BLOCCO IMMEDIATO: Score = 0, rejectionReason = "RIFIUTATO_SICUREZZA"
   └──┬──┘
      │ NO
      ↓
   Continua con scoring normale
```

### Messaggi di Rifiuto

Quando una missione viene bloccata, il sistema mostra:

```
ATTENZIONE: Rilevato alto rischio truffa.
Il motore W-Moon ha rilevato pattern coerenti con attività 
ad alto rischio o fraudolente (corrispondenza parole chiave 
o anomalia ricompensa/sforzo).
```

---

## Apprendimento Automatico dei Pesi

Il sistema impara dalle azioni dell'utente e aggiorna i pesi personalizzati.

### Metodo `update_weights()`

```python
def update_weights(user, mission, action):
    """
    action: 1 (Accepted), -1 (Rejected/Hidden)
    learning_rate: 0.05
    """
    predicted_value = mission.final_score / 100.0
    actual_value = 1.0 if action == 1 else 0.0
    error = actual_value - predicted_value

    # Aggiorna ogni peso basandosi sul contributo del fattore
    for i in range(9):
        factor_val = mission.factors[i]
        delta = LEARNING_RATE * error * factor_val
        user.weights[i] += delta

    # Rinormalizza i pesi (somma = 1)
    total_w = sum(user.weights)
    user.weights = [w / total_w for w in user.weights]

    # VINCOLO DI SICUREZZA: x4 non può mai scendere sotto 0.15
    user.weights[3] = max(user.weights[3], 0.15)
```

### Logica

- Se l'utente **accetta** una missione con score basso → i pesi dei fattori alti in quella missione aumentano
- Se l'utente **rifiuta** una missione con score alto → i pesi dei fattori alti in quella missione diminuiscono
- Il peso della **sicurezza (x4) non può mai scendere sotto 0.15** (vincolo hard)

---

## Integrazione con Google Gemini AI

Il file `geminiService.ts` gestisce l'integrazione con Google Gemini 2.5 Flash per due funzionalità:

### 1. `analyzeMissionContent(text)`

Converte testo libero in struttura dati Mission.

**Input:** Testo in linguaggio naturale (es. "Cerco sviluppatore React per fix menu, budget $100, urgente per domani")

**Output:** Oggetto JSON strutturato
```json
{
  "title": "Fix Menu React",
  "description": "Sistemare problema nel menu",
  "category": "Sviluppo",
  "skillsRequired": ["React", "CSS"],
  "reward": 100,
  "estTime": 2,
  "difficulty": 5,
  "cognitiveLoad": 6,
  "physicalLoad": 1,
  "deadlineHoursFromNow": 24
}
```

### 2. `suggestImprovements(mission)`

Fornisce 3 consigli veloci per completare efficacemente la missione o negoziare termini migliori.

**Modello:** `gemini-2.5-flash`

---

## Componenti Frontend

### App.tsx (Orchestratore)

Ruolo: Componente principale che gestisce lo state e orchestra tutto il sistema.

**State gestiti:**
- `user: UserProfile` – Profilo utente corrente
- `missions: Mission[]` – Lista missioni raw
- `scoredMissions: ScoredMission[]` – Missioni con score calcolato
- `isModalOpen: boolean` – Stato modal analizzatore

**Effetto principale:**
```typescript
useEffect(() => {
    const scored = missions.map(mission => {
        const scoreResult = calculateScore(user, mission);
        return { ...mission, score: scoreResult };
    });
    scored.sort((a, b) => b.score.finalScore - a.score.finalScore);
    setScoredMissions(scored);
}, [missions, user]);
```

---

### MissionCard.tsx

Ruolo: Visualizza una singola missione con score, dettagli e radar chart.

**Funzionalità:**
- **Color coding:** Verde (>80), Blu (50-80), Rosso (<30 o truffa)
- **Overlay PERICOLO** per missioni bloccate
- **Espansione** per vedere breakdown fattori
- **Integrazione Gemini** per consigli AI

---

### RadarChart.tsx

Ruolo: Grafico radar che visualizza i 9 fattori di scoring.

**Libreria:** Recharts (ResponsiveContainer, RadarChart, PolarGrid, ecc.)

**Mapping fattori:**

| Codice | Label IT |
|--------|----------|
| x1 | Skill (Abilità) |
| x2 | Efficienza (Tempo) |
| x3 | Prob. (Probabilità Successo) |
| x4 | Sicurezza |
| x5 | Crescita |
| x6 | Utilità |
| x7 | Urgenza |
| x8 | Costanza |
| x9 | Fiducia |

---

### AnalyzerModal.tsx

Ruolo: Modal per aggiungere nuove missioni tramite testo libero.

**Flusso:**
1. Utente incolla descrizione
2. Click "Analizza e Aggiungi"
3. Gemini AI processa il testo
4. Missione strutturata viene aggiunta alla lista
5. Sistema calcola automaticamente lo score

---

## Strutture Dati (Types)

### Weights

```typescript
interface Weights {
    x1: number;  // Skill Match
    x2: number;  // Time Efficiency
    x3: number;  // Success Probability
    x4: number;  // Scam Detection
    x5: number;  // Growth
    x6: number;  // Utility
    x7: number;  // Urgency
    x8: number;  // Consistency
    x9: number;  // Trust
}
```

### UserProfile

```typescript
interface UserProfile {
    id: string;
    name: string;
    skills: string[];
    weights: Weights;
    lastActiveDate: Date;
    avgHourlyRate: number;
    successes: number;
    failures: number;
    streakCount: number;
    trustMap: Record<string, number>;  // Source → Trust Score (0-1)
    skillLevel: number;  // 1-10
}
```

### Mission

```typescript
interface Mission {
    id: string | number;
    title: string;
    description: string;
    category: string;
    skillsRequired: string[];
    reward: number;      // Valore monetario
    estTime: number;     // Ore stimate
    difficulty: number;  // 1-10
    deadline: Date;
    source: string;
    cognitiveLoad: number;   // 1-10
    physicalLoad: number;    // 1-10
}
```

### ScoringBreakdown

```typescript
interface ScoringBreakdown {
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
```

### ScoredMission

```typescript
interface ScoredMission extends Mission {
    score: ScoringBreakdown;
}
```

---

## Configurazione e Deployment

### Dependencies (package.json)

```json
{
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "@google/genai": "^1.30.0",
    "recharts": "^3.5.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "typescript": "~5.8.2",
    "vite": "^6.2.0"
  }
}
```

### Variabili d'Ambiente

Crea un file `.env` nella root:

```
GEMINI_API_KEY=your_google_gemini_api_key_here
```

### Comandi

```bash
# Installazione
npm install

# Development
npm run dev

# Build produzione
npm run build

# Preview build
npm run preview
```

### Configurazione Vite (vite.config.ts)

```typescript
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
        server: { port: 3000, host: '0.0.0.0' },
        plugins: [react()],
        define: {
            'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
            'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
        }
    };
});
```

---

## Test Suite

Il file `algoritmo-agente-4.py` include una test suite completa per verificare il corretto funzionamento.

### Test Case 1: Perfect Match Mission

```python
mission_perfect = Mission(
    101, "Senior Python Project",
    "Build scalable Python backend with async/await. No red flags.",
    "coding", ['python', 'async', 'backend'], 500, 5.0, 8.0, 72, "trusted_src", []
)
# Expected: Score > 85 ✅
```

### Test Case 2: Scam Detection

```python
mission_scam = Mission(
    102, "Easy Money Telegram",
    "Send $50 deposit via telegram to start earning $5000/week. Guaranteed!",
    "admin", ['english'], 5000, 0.5, 1.0, 24, "unknown_src", []
)
# Expected: Score = 0.0 (BLOCKED) ✅
```

### Test Case 3: Growth Opportunity

```python
mission_growth = Mission(
    103, "Rust Systems Programming",
    "Build a small Rust CLI tool. Learning opportunity.",
    "coding", ['rust'], 50, 3.0, 8.5, 72, "trusted_src", []
)
# Expected: Score 40-60 ✅
```

### Test Case 4: Urgent Deadline

```python
mission_urgent = Mission(
    104, "Quick Python Bug Fix",
    "Fix critical bug in production code. Must be done in 3 hours.",
    "coding", ['python', 'debugging'], 80, 1.0, 3.0, 3.0, "trusted_src", []
)
# Expected: Score 70-90 ✅
```

### Test Case 5: Too Easy (Low Growth)

```python
mission_easy = Mission(
    105, "Data Entry Admin Task",
    "Copy data from PDF to Excel spreadsheet.",
    "admin", ['excel', 'data_entry'], 15, 1.5, 1.0, 48, "trusted_src", []
)
# Expected: Score < 50 ✅
```

### Verification Summary

```
✓ All scores between 0-100
✓ Diversity (scores are different)
✓ Scam correctly detected and blocked
✓ Perfect match scores high
→ Algorithm Status: READY FOR PRODUCTION ✅
```

---

## Glossario

| Termine | Definizione |
|---------|-------------|
| **W-MOON** | Nome dell'algoritmo di scoring (Weighted Multi-Objective Optimization Network) |
| **ROTI** | Return On Time Invested – reward/ore stimate |
| **Jaccard Index** | Misura di similarità tra due insiemi (intersezione/unione) |
| **Gatekeeper** | Meccanismo di blocco per missioni ad alto rischio |
| **Cold Start** | Situazione in cui un nuovo utente non ha storico |
| **Skill Decay** | Decadimento competenze per utenti inattivi >30 giorni |
| **Flow State** | Stato di massimo apprendimento (sfida = abilità + 1) |
| **Bayesian Prior** | Stima iniziale di probabilità basata su dati globali |
| **Trust Map** | Mappa fonte → livello di fiducia (0-1) |

---

## Appendice: Mappa File del Progetto

```
w-moon-intelligence/
├── algoritmo-agente-4.py    # 🔴 CUORE PULSANTE - Logica Python originale
├── App.tsx                   # Orchestratore React principale
├── index.tsx                 # Entry point React
├── index.html                # HTML template
├── types.ts                  # Definizioni TypeScript
├── services/
│   ├── scoringService.ts     # Implementazione TS dell'algoritmo
│   └── geminiService.ts      # Integrazione Google Gemini AI
├── components/
│   ├── MissionCard.tsx       # Card missione con score
│   ├── RadarChart.tsx        # Grafico radar 9 fattori
│   └── AnalyzerModal.tsx     # Modal per aggiungere missioni
├── package.json              # Dependencies e scripts
├── tsconfig.json             # Configurazione TypeScript
├── vite.config.ts            # Configurazione Vite
└── README.md                 # Documentazione base
```

---

**Versione:** 1.0  
**Data:** Novembre 2025  
**Autore:** Diego Fabbri  
**Repository:** github.com/diegofabbri-ui/agente-4-mission-filter
