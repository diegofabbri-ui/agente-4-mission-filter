# SYSTEM ROLE: HEADHUNTER DATA EXTRACTOR (BROAD MODE)

**Role:** Autonomous Data Extraction Engine.
**Objective:** Scrape active job listings and convert them into structured JSON.
**Priority:** QUANTITY & RELEVANCE > STRICT PRICE FILTERING.

---

## 1. DATA EXTRACTION RULES

You must output a JSON Array. Map the search findings to these exact keys:

* **`title`**: Job title.
* **`company_name`**: Hiring company or "Upwork Client".
* **`source_url`**: **CRITICAL**. The direct link to the job. If finding a list, pick the top specific links.
* **`platform`**: "Upwork", "Fiverr", "LinkedIn", etc.
* **`payout_estimation`**: If strictly numeric (e.g. "$50"), use it. If "Negotiable", ESTIMATE it based on market rates for that role (e.g. "30"). NEVER return "0" or "null".
* **`tasks_breakdown`**: An array of objects describing the workload composition for the geometric graph.
    * Format: `[{"label": "Coding", "percent": 50}, {"label": "Testing", "percent": 50}]`
    * If the job has 4 main tasks, this array length must be 4 (Square). If 6, length 6 (Hexagon).
* **`analysis_notes`**: A brief marketing hook explaining why this job is good.

---

## 2. SEARCH STRATEGY (WIDE NET)

1.  **Ignore Price Filtering:** Do not filter by price during search. Retrieve the job first. We will filter later.
2.  **Estimate Missing Data:** If a job description says "Looking for React Dev", assume "Intermediate" level and estimate typical hourly rate ($30-$60) instead of discarding it.
3.  **Validate URL:** Ensure the URL looks like a job post (contains `jobs/`, `view-job`, `freelance-jobs`).

---

## 3. OUTPUT FORMAT (Strict JSON)

```json
[
  {
    "title": "React Frontend Fix",
    "company_name": "TechFlow",
    "source_url": "[https://upwork.com/jobs/](https://upwork.com/jobs/)...",
    "platform": "Upwork",
    "payout_estimation": "150",
    "tasks_breakdown": [
        {"label": "Debugging", "percent": 40},
        {"label": "Coding", "percent": 40},
        {"label": "Communication", "percent": 20}
    ],
    "match_score": 85,
    "analysis_notes": "Quick fix with high rating client."
  }
]
'''

*(Nota: Fai lo stesso concetto per `system_headhunter_weekly.md` e `monthly.md`, rimuovendo i blocchi "EXCLUDE < $100" e aggiungendo la richiesta `tasks_breakdown`).*

---

### ⚙️ PASSO 2: Aggiornare il Servizio (Perplexity Service)

Dobbiamo aggiornare il codice per:
1.  **Rimuovere il blocco `reward < 10`**. Accettiamo tutto, poi magari flagghiamo quelli bassi ma li mostriamo.
2.  **Parsare il Grafico Geometrico**. Salvare la `tasks_breakdown` dentro `raw_data` o un campo dedicato JSONB.
3.  **Forzare l'URL**.

Sostituisci **`src/services/perplexity.service.ts`**:

```typescript
import axios from 'axios';
import { db } from '../infra/db';
import fs from 'fs';
import path from 'path';

export class PerplexityService {
  private apiKey: string;
  private kbPath: string;

  constructor() {
    this.apiKey = process.env.PERPLEXITY_API_KEY || '';
    const isProd = process.env.NODE_ENV === 'production';
    this.kbPath = isProd 
      ? path.join(process.cwd(), 'dist', 'knowledge_base')
      : path.join(process.cwd(), 'src', 'knowledge_base');
  }

  private loadTextFile(filename: string): string {
    try {
      return fs.readFileSync(path.join(this.kbPath, filename), 'utf-8');
    } catch (e) { return ""; }
  }

  public async findGrowthOpportunities(userId: string, clientProfile: any, mode: 'daily' | 'weekly' | 'monthly' = 'daily') {
    console.log(`🚀 [HUNTER] Caccia ${mode.toUpperCase()} per ${userId}`);

    // Caricamento prompt meno restrittivi
    let systemInstruction = "";
    if (mode === 'weekly') systemInstruction = this.loadTextFile('system_headhunter_weekly.md');
    else if (mode === 'monthly') systemInstruction = this.loadTextFile('system_headhunter_monthly.md');
    else systemInstruction = this.loadTextFile('system_headhunter_prompt.md');

    if (!systemInstruction) systemInstruction = "Find active freelance jobs. Return JSON with 'tasks_breakdown'.";

    const searchMessages = [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: `
        PROFILE: ${clientProfile.dreamRole}
        SKILLS: ${(clientProfile.keySkillsToAcquire || []).join(', ')}
        
        TASK: Find 5 REAL job listings matching '${mode}' duration.
        CRITICAL: Include valid 'source_url' and 'tasks_breakdown' array for visual graph generation.
        Estimate 'payout_estimation' if missing (don't return 0).
      ` }
    ];

    try {
      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'sonar-pro', 
          messages: searchMessages,
          temperature: 0.1 
        },
        { headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' } }
      );

      const rawContent = response.data.choices[0].message.content;
      await this.processAndSaveOpportunities(rawContent, userId, mode);

    } catch (error: any) {
      console.error("❌ Errore Perplexity:", error.message);
      throw new Error("Errore Caccia.");
    }
  }

  private async processAndSaveOpportunities(rawJson: string, userId: string, type: 'daily' | 'weekly' | 'monthly') {
    try {
      const cleanJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      const startIndex = cleanJson.indexOf('[');
      const endIndex = cleanJson.lastIndexOf(']');
      if (startIndex === -1) throw new Error("JSON non trovato.");
      
      const missions = JSON.parse(cleanJson.substring(startIndex, endIndex + 1));
      let maxCommands = type === 'weekly' ? 100 : (type === 'monthly' ? 400 : 20);

      for (const m of missions) {
        // Parsing PREZZO più permissivo. Se è 0, mettiamo 1 (simbolico) per non scartarlo, 
        // l'utente valuterà dall'URL.
        let reward = this.parseReward(m.payout_estimation || m.budget || m.reward);
        if (reward === 0) reward = 1; 

        // Parsing URL
        const finalUrl = m.source_url || m.url || "#";

        const exists = await db.selectFrom('missions').select('id').where('source_url', '=', finalUrl).executeTakeFirst();

        if (!exists) {
            await db.insertInto('missions')
              .values({
                user_id: userId,
                title: m.title || "Nuova Opportunità",
                description: m.description || m.summary || "Dettagli nel link.",
                source_url: finalUrl,
                source: m.platform || "Web",
                reward_amount: reward,
                estimated_duration_hours: m.hours || 1,
                status: 'pending',
                type: type,
                max_commands: maxCommands,
                conversation_history: JSON.stringify([]),
                platform: m.platform || "General",
                company_name: m.company_name || m.company || "Confidenziale",
                match_score: m.match_score || 80,
                // Salviamo il breakdown dei task nel raw_data per il grafico frontend
                raw_data: JSON.stringify({ tasks_breakdown: m.tasks_breakdown || [] }),
                analysis_notes: m.analysis_notes || "Opportunità rilevata."
              })
              .execute();
        }
      }
      console.log(`✅ Salvate ${missions.length} missioni.`);
    } catch (e) { console.error("Errore salvataggio:", e); }
  }

  private parseReward(rewardString: string | number): number {
    if (typeof rewardString === 'number') return rewardString;
    if (!rewardString) return 0;
    // Rimuove tutto tranne numeri
    const clean = rewardString.replace(/[^0-9.]/g, '');
    return parseFloat(clean) || 0;
  }
}
'''

