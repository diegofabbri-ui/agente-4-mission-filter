# ✅ CHECKLIST BUILD AGENTE 4 - VERSION FINALE PRO
## Con Opal Google + OpenAI + Google AI Studio
## Step-by-Step Completo 72 Ore + Tools Integration

---

## 🎯 QUESTA CHECKLIST INCLUDE:

**3 Strumenti AI Pro per Building Agente:**
- ✅ ChatGPT Pro (GPT-4 + Sonnet 4.5) - CODICE PRODUCTION
- ✅ Google Gemini Pro + Google AI Studio - DATABASE + AI ALGORITHM
- ✅ Opal Google (Sheets/Docs automation) - WORKFLOW CLIENT FILES
- ✅ Perplexity Pro - RESEARCH + API DOCUMENTATION

---

# PARTE 1: PRE-SPRINT SETUP (45 MINUTI)

## SETUP BROWSER + TOOLS

### Browser Tabs (8 tabs)

```
TAB GROUP 1 - AI TOOLS:
  1. ChatGPT Pro (https://chatgpt.com) - CODICE
  2. Google Gemini Pro (https://gemini.google.com) - ALGORITMI
  3. Google AI Studio (https://aistudio.google.com) - TESTING
  4. Perplexity Pro (https://perplexity.ai) - RICERCA

TAB GROUP 2 - DEVELOPMENT:
  5. GitHub (https://github.com) - VERSION CONTROL
  6. VSCode (localhost) - CODING
  7. Supabase Dashboard - DATABASE
  8. Google Sheet (Sprint Log) - TRACKING

TAB GROUP 3 - DEPLOYMENT:
  9. Railway Dashboard - BACKEND DEPLOY
  10. Vercel Dashboard - FRONTEND DEPLOY
  11. Stripe Dashboard - PAYMENTS
  12. OpenAI API Dashboard - TOKEN MONITORING
```

### Google Workspace Setup (Opal)

```
OPAL WORKFLOW PER CLIENTE FILES:

Google Drive Folder Structure:
├─ Agente4_ClientFiles/
│  ├─ Clienti/ 
│  │  ├─ [ClientName]_Profile/
│  │  │  ├─ user-profile-setup.md
│  │  │  ├─ mission-preferences.md
│  │  │  ├─ skill-inventory.md
│  │  │  ├─ daily-schedule.md
│  │  │  ├─ monthly-goal-plan.md
│  │  │  └─ ai-learning-preferences.md
│  │  └─ [ClientName]_Profile/
│  │
│  ├─ Templates/
│  │  ├─ FILE_TEMPLATE_1_Profile.md
│  │  ├─ FILE_TEMPLATE_2_Missions.md
│  │  ├─ ...
│  │
│  └─ Opal_Automations/
│     ├─ file-import-trigger.opal
│     ├─ data-to-supabase-sync.opal
│     └─ client-onboarding-flow.opal
```

---

# PARTE 2: GIORNO 1 (8 ORE) - DATABASE + AI ENGINE

## GIORNO 1A: Database Design + AI Algorithm (3 ORE)

### ✅ STEP 1: AI Algorithm Design (60 min)

**Tool: Google Gemini Pro + Google AI Studio**

**PROMPT per Gemini Pro:**

```
Design complete AI filtering algorithm for mission recommendation:

Context:
- User provides missions manually
- AI must score each mission for this specific user
- Score factors: skill match, time efficiency, success probability, scam detection, personal growth

Requirements:
1. 9-factor scoring model (weighted)
2. Learning mechanism (improve over time)
3. Personalization (adapts to user's style)
4. Scam detection rules
5. Edge case handling (new users, inactive users)

Output:
- Mathematical formula for each factor
- Pseudocode for scoring algorithm
- Learning loop mechanism
- Example score calculation (walkthrough)

Format: Pseudocode + detailed explanation
```

**Azione:**
1. Copia prompt
2. Incolla in Gemini Pro
3. Leggi risposta (3-4 min)
4. **Poi** testa formula in Google AI Studio:
   - Crea test case (fake mission data)
   - Verifica scoring logic
   - Assicura che score 0-100 sia consistente
5. Salva output in `docs/AI_ALGORITHM.md`

**Tempo: 60 min ✓**

---

### ✅ STEP 2: Database Schema (Gemini Pro + ChatGPT Pro) (60 min)

**Tool: Google Gemini Pro - Design, ChatGPT Pro - SQL**

**PROMPT per Gemini Pro:**

```
Design PostgreSQL 17 schema for Mission Finder AI agent.

Tables (9 total):
1. users - Profile + settings
2. user_preferences - Mission categories preference
3. user_ai_profile - Learning profile (evolves over time)
4. missions - Individual missions added by users
5. mission_filters - AI scoring results
6. user_mission_history - Tracking acceptance/completion
7. earnings - Payment tracking
8. gamification_progress - Badges, levels, streaks
9. ai_audit_log - Transparency log

For each table:
- Field names + types
- Primary/foreign keys
- Indexes needed
- RLS policies
- Sample data

Output: SQL-ready schema + RLS policies + indexes
```

**Azione:**
1. Copia prompt
2. Incolla in Gemini Pro
3. Aspetta risposta (3-4 min)
4. Copia schema SQL
5. **Poi** in ChatGPT Pro:

**PROMPT per ChatGPT Pro:**

```
Convert this schema design into production-ready PostgreSQL 17 SQL:

[PASTE GEMINI SCHEMA]

Generate:
1. Complete CREATE TABLE statements
2. RLS security policies
3. Useful indexes
4. Sample INSERT statements for testing

Format: Copy-paste ready SQL
```

**Azione:**
1. Copia SQL finale
2. Salva in `docs/schema.sql`
3. Salva anche in `scripts/01-init-db.sql`

**Tempo: 60 min ✓**

---

### ✅ STEP 3: Supabase Deploy (30 min)

**Tool: Supabase Dashboard**

```
1. Go https://supabase.com
2. Create project: "agente-4-mission-filter"
3. Copy SQL from `docs/schema.sql`
4. Go to SQL Editor
5. Paste all SQL
6. Click "Run"
7. Verify: 9 tables created ✓
8. Enable RLS on all tables (Settings > RLS)
9. Copy DATABASE_URL (postgresql://...)
10. Save to .env as DATABASE_URL
11. Test connection from VSCode:
    npm install -g supabase-cli
    supabase link --project-ref [YOUR_PROJECT_ID]
```

**Status:**
- [ ] Project created
- [ ] Schema deployed
- [ ] RLS enabled
- [ ] DATABASE_URL in .env
- [ ] Local connection tested

**Tempo: 30 min ✓**

**Subtotale GIORNO 1A: 3 ore ✓**

---

## GIORNO 1B: Backend Implementation (5 ORE)

### ✅ STEP 4: Project Init + Dependencies (30 min)

**Tool: VSCode Terminal**

```bash
# 1. Create project
mkdir agente-4-mission-filter
cd agente-4-mission-filter

# 2. Init git
git init
git remote add origin https://github.com/[YOU]/agente-4-mission-filter.git

# 3. Node setup
npm init -y

# 4. Install core dependencies
npm install express typescript @types/express @types/node
npm install @supabase/supabase-js
npm install zod jose
npm install stripe @sendgrid/mail
npm install axios cheerio
npm install dotenv

# 5. Dev dependencies
npm install -D ts-node nodemon @types/node typescript

# 6. TypeScript config
npx tsc --init

# 7. Project structure
mkdir -p src/{routes,services,middleware,types,utils,integrations,jobs}
mkdir -p {docs,config,scripts}
touch src/index.ts .env .env.example

# 8. Create tsconfig.json (if needed)
# Create next...
```

**Tempo: 30 min ✓**

---

### ✅ STEP 5: AI Filtering Service (150 min)

**Tool: ChatGPT Pro (code), Google Gemini Pro (algorithm reference)**

**PROMPT per ChatGPT Pro:**

```
Implement mission filtering AI service (Node 22 + TypeScript):

Based on the algorithm from: [INSERT GEMINI ALGORITHM RESPONSE]

Generate:
1. src/services/mission-filter.service.ts (MissionFilterService class)
   - Method: filterMissionsForUser(userId: string, missions: Mission[])
   - Returns: FilteredMission[] with scores + reasoning
   - Uses OpenAI API for NLP analysis (mission understanding)
   
2. src/services/ai-profile.service.ts (UserAIProfileService)
   - Method: updateProfileAfterMission(userId, mission, outcome)
   - Learns from user behavior
   - Improves future scoring
   
3. src/utils/scoring-functions.ts
   - skillMatchScore(userSkill, missionDifficulty)
   - timeEfficiencyScore(payout, duration, timeAvailable)
   - successProbabilityScore(userHistory, missionCategory)
   - scamDetectionScore(missionData)
   - personalGrowthScore(userTrend, missionDifficulty)
   - All 9 scoring factors
   
4. src/types/mission-filter.types.ts
   - TypeScript interfaces for all entities

Requirements:
- OpenAI API integration (for NLP)
- Kysely ORM (not Prisma)
- Error handling + logging
- Caching (Redis optional, in-memory ok for MVP)
- Cost-optimized (use gpt-3.5-turbo, not GPT-4 for main scoring)

Output: 4 production-ready files
```

**Azione:**
1. Copia prompt
2. Incolla in ChatGPT Pro
3. Aspetta 5-7 min (è complesso)
4. Copia 4 file output
5. Create in `src/services/`, `src/utils/`, `src/types/`
6. `npm install openai @kiss/html`
7. Add OPENAI_API_KEY to .env

**Tempo: 150 min ✓**

---

### ✅ STEP 6: API Endpoints (60 min)

**Tool: ChatGPT Pro**

**PROMPT:**

```
Generate Express API endpoints (Node 22 + TypeScript):

Endpoints needed:
1. POST /api/auth/register
2. POST /api/auth/login
3. POST /api/missions/add
4. GET /api/missions/my-missions
5. POST /api/missions/:id/filter-ai
6. GET /api/missions/recommended
7. POST /api/missions/:id/accept
8. POST /api/missions/:id/complete
9. PATCH /api/user/profile
10. GET /api/user/dashboard

Generate:
1. src/routes/missions.routes.ts (all endpoints)
2. src/middleware/auth.middleware.ts
3. src/index.ts (main app file)

Requirements:
- Zod validation on all inputs
- JWT authentication
- Error handling
- Logging

Output: 3 files complete, copy-paste ready
```

**Azione:**
1. Copy prompt
2. Paste ChatGPT Pro
3. Copy 3 files
4. Create in `src/routes/`, `src/middleware/`
5. Test: `npm run dev` → should start on :3000

**Tempo: 60 min ✓**

**Subtotale GIORNO 1B: 5 ore ✓**

---

## GIORNO 1C: Deploy Backend (1.5 HOURS)

### ✅ STEP 7: Payment Service (60 min)

**Tool: ChatGPT Pro**

```
Generate Stripe payment service (Node 22):

Files:
1. src/services/payment.service.ts (payment logic)
2. src/services/stripe.service.ts (Stripe integration)
3. src/routes/payments.routes.ts
4. src/utils/commission-tiers.ts

Commission tiers:
- <€100/mese: 10%
- €100-300/mese: 15%
- €300+/mese: 20%
- Premium (€9.99/mese): 0%

Output: 4 production-ready files
```

**Tempo: 60 min ✓**

---

### ✅ STEP 8: Railway Deploy (30 min)

**Tool: Railway Dashboard**

```
1. git add . && git commit -m "Core backend complete"
2. git push origin main
3. Go Railway.app
4. New project > "agente-4-mission-filter"
5. Connect GitHub repo
6. Set environment variables:
   - DATABASE_URL
   - JWT_SECRET
   - OPENAI_API_KEY
   - STRIPE_SECRET_KEY
7. Deploy (3-5 min)
8. Test: curl https://[project].railway.app/api/health
```

**Status:**
- [ ] Deployed successfully
- [ ] Health check passing
- [ ] URL: ___________________________

**Tempo: 30 min ✓**

**Subtotale GIORNO 1C: 1.5 ore ✓**

---

## 📊 GIORNO 1 SUMMARY (8 ore) ✓

**Backend:** LIVE at https://agente-4-mission-filter.railway.app

---

# PARTE 3: GIORNO 2 (8 ORE) - FRONTEND + COMPONENTS

## GIORNO 2A: React Setup (1.5 ORE)

### ✅ STEP 9: React 19 + Vite (30 min)

**Tool: ChatGPT Pro**

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install react-hook-form zod axios chart.js react-chartjs-2
npm install tailwindcss postcss autoprefixer
npx tailwindcss init -p
npm run dev
```

**Tempo: 30 min ✓**

---

### ✅ STEP 10: Core Pages (60 min)

**Tool: ChatGPT Pro**

5 pages:
1. Landing.tsx
2. ProfileSetup.tsx ⭐ (reads FILE #1)
3. MissionAdder.tsx ⭐ (adds missions)
4. AIRecommendations.tsx (shows TOP 3-5)
5. Dashboard.tsx (earnings tracking)

**Output:** 5 production-ready .tsx files

**Tempo: 60 min ✓**

**Subtotale GIORNO 2A: 1.5 ore ✓**

---

## GIORNO 2B: AI Components (2.5 ORE)

### ✅ STEP 11: AI Display Components (90 min)

**Tool: ChatGPT Pro**

3 components:
1. MissionCard.tsx (with AI scores)
2. AIExplanation.tsx (scoring breakdown)
3. RecommendationsList.tsx (top 3-5)

**Tempo: 90 min ✓**

---

### ✅ STEP 12: Mission Execution (60 min)

**Tool: ChatGPT Pro**

3 pages/components:
1. MissionExecuting.tsx (step-by-step guide)
2. MissionResult.tsx (completion screen)
3. MissionFeedback.tsx (user rating)

**Tempo: 60 min ✓**

**Subtotale GIORNO 2B: 2.5 ore ✓**

---

## GIORNO 2C: Deploy Frontend (1 ORA)

### ✅ STEP 13: Vercel Deploy (60 min)

**Tool: Vercel Dashboard**

```
1. Connect GitHub repo to Vercel
2. Set env: VITE_API_URL=https://agente-4-mission-filter.railway.app
3. Deploy (wait 2 min)
4. E2E test all features
5. Mobile responsive check
```

**Status:**
- [ ] Frontend deployed
- [ ] All pages working
- [ ] URL: ___________________________

**Tempo: 60 min ✓**

**Subtotale GIORNO 2C: 1 ora ✓**

---

## 📊 GIORNO 2 SUMMARY (8 ore) ✓

**Frontend:** LIVE at https://agente-4-mission-filter.vercel.app

---

# PARTE 4: GIORNO 3 (8 ORE) - LEARNING + MONITORING + LAUNCH

## GIORNO 3A: AI Learning Loop (1.5 ORE)

### ✅ STEP 14: Learning System (90 min)

**Tool: ChatGPT Pro**

3 files:
1. src/jobs/learn-from-user.job.ts
2. src/services/ai-learning.service.ts
3. src/utils/accuracy-metrics.ts

**Tempo: 90 min ✓**

---

## GIORNO 3B: Admin + Monitoring (2.5 ORE)

### ✅ STEP 15: Admin Dashboard (60 min)

**Tool: ChatGPT Pro**

4 pages:
1. AdminStats.tsx
2. UserManagement.tsx
3. MissionAudit.tsx
4. AIMetrics.tsx

**Tempo: 60 min ✓**

---

### ✅ STEP 16: Monitoring + Analytics (90 min)

**Tool: Perplexity Pro (research) + ChatGPT Pro (implementation)**

```
Setup:
1. Sentry (error tracking)
2. GA4 (event tracking)
3. Database monitoring
4. Health checks

Output: src/index.ts + src/main.tsx updated with monitoring
```

**Tempo: 90 min ✓**

**Subtotale GIORNO 3B: 2.5 ore ✓**

---

## GIORNO 3C: Legal + Launch (2 ORE)

### ✅ STEP 17: Legal Documents (60 min)

**Tool: ChatGPT Pro**

4 docs:
1. docs/legal/PRIVACY_POLICY.md
2. docs/legal/TERMS_OF_SERVICE.md
3. docs/legal/AI_TRANSPARENCY.md
4. docs/legal/SECURITY_CHECKLIST.md

**Tempo: 60 min ✓**

---

### ✅ STEP 18: Launch (60 min)

**Tool: GitHub + Railway + Vercel**

```
1. Final commit: git add -A && git commit -m "🚀 Launch v1.0"
2. Push to GitHub
3. Verify both deployments
4. Health checks passing
5. Announce launch
```

**Tempo: 60 min ✓**

**Subtotale GIORNO 3C: 2 ore ✓**

---

## 📊 GIORNO 3 SUMMARY (8 ore) ✓

**STATUS: 🚀 LIVE AND OPERATIONAL**

---

# TOOL ALLOCATION SUMMARY (72 HOURS)

| Task | Tool Principale | Tool Secondario | Duration |
|------|-----------------|-----------------|----------|
| Algorithm Design | **Google Gemini Pro** | Google AI Studio | 60 min |
| Database Schema | **Google Gemini Pro** | ChatGPT Pro | 60 min |
| Database Deploy | Supabase Dashboard | - | 30 min |
| AI Service Code | **ChatGPT Pro** | Google Gemini Pro | 150 min |
| API Endpoints | **ChatGPT Pro** | - | 60 min |
| Payment Service | **ChatGPT Pro** | - | 60 min |
| Backend Deploy | Railway | - | 30 min |
| React Setup | **ChatGPT Pro** | - | 30 min |
| Core Pages | **ChatGPT Pro** | - | 60 min |
| AI Components | **ChatGPT Pro** | - | 150 min |
| Frontend Deploy | Vercel | - | 60 min |
| Learning System | **ChatGPT Pro** | - | 90 min |
| Admin Dashboard | **ChatGPT Pro** | - | 60 min |
| Monitoring | **Perplexity Pro** | ChatGPT Pro | 90 min |
| Legal Docs | **ChatGPT Pro** | - | 60 min |
| Launch | GitHub + Railway + Vercel | - | 60 min |

---

# FINAL SYSTEM (POST-LAUNCH)

✅ **Backend:** Node 22 + TypeScript + Express + Supabase
✅ **Frontend:** React 19 + Vite + TypeScript + Tailwind v4
✅ **AI Engine:** OpenAI API (GPT-3.5-turbo for cost) + Google Gemini API
✅ **Database:** PostgreSQL 17 on Supabase
✅ **Payments:** Stripe integration
✅ **Monitoring:** Sentry + GA4
✅ **Deployment:** Railway (backend) + Vercel (frontend)

**Total Files Generated:** 60+
**Code Lines:** 5,000+
**Setup Time:** 72 hours
**Production Ready:** YES ✅