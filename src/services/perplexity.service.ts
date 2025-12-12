import axios from 'axios';
import { db } from '../infra/db';
import { sql } from 'kysely'; 
import fs from 'fs';
import path from 'path';

// --- 1. CONFIGURAZIONE FALLBACK (INDEED RIMOSSO) ---
const FALLBACK_SOURCES = {
    // Rimosso Indeed e Glassdoor (spesso richiedono login o hanno link rotti)
    aggregators: ["google.com/search?ibp=htl;jobs", "linkedin.com/jobs"], 
    general_remote: ["upwork.com/jobs", "freelancer.com/projects", "fiverr.com", "remoteok.com"],
    tech_dev: ["stackoverflow.com/jobs", "github.com/jobs", "toptal.com", "weworkremotely.com"],
    writing_content: ["problogger.com/jobs", "contently.net"],
    design_creative: ["behance.net/joblist", "dribbble.com/jobs"],
    marketing_sales: ["marketerhire.com", "growth.org/jobs"]
};

let sourcesMasterlist: any = FALLBACK_SOURCES;

try {
    const pathsToTry = [
        path.join(process.cwd(), 'src', 'knowledge_base', 'sources_masterlist.json'),
        path.join(process.cwd(), 'dist', 'knowledge_base', 'sources_masterlist.json'),
        path.join(__dirname, '..', 'knowledge_base', 'sources_masterlist.json')
    ];
    
    for (const p of pathsToTry) {
        if (fs.existsSync(p)) {
            sourcesMasterlist = JSON.parse(fs.readFileSync(p, 'utf-8'));
            break;
        }
    }
} catch (e) {
    console.warn("⚠️ [SYSTEM] Masterlist non trovata. Uso Fallback.");
}

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
      const filePath = path.join(this.kbPath, filename);
      if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf-8');
      return "";
    } catch (e) { return ""; }
  }

  // ==================================================================================
  // 🔍 CORE: RICERCA (No Indeed + No Full-Time)
  // ==================================================================================
  public async findGrowthOpportunities(userId: string, clientProfile: any, mode: 'daily' | 'weekly' | 'monthly' = 'daily') {
    
    const now = new Date();
    const currentISO = now.toISOString(); 
    
    // Calcolo Finestra Temporale
    const lookbackDays = mode === 'daily' ? 1 : (mode === 'weekly' ? 3 : 7);
    const pastDate = new Date();
    pastDate.setDate(now.getDate() - lookbackDays);
    const pastDateISO = pastDate.toISOString();

    console.log(`🚀 [HUNTER] Caccia ${mode.toUpperCase()} | Start: ${currentISO}`);

    // Caricamento Prompt
    let systemInstruction = "";
    if (mode === 'weekly') systemInstruction = this.loadTextFile('system_headhunter_weekly.md');
    else if (mode === 'monthly') systemInstruction = this.loadTextFile('system_headhunter_monthly.md');
    else systemInstruction = this.loadTextFile('system_headhunter_prompt.md');

    if (!systemInstruction) systemInstruction = "You are a headhunter. Find active freelance jobs.";

    // Selezione Fonti (Pulizia aggressiva di Indeed)
    const userRole = (clientProfile.dreamRole || "freelancer").toLowerCase();
    const userSkills = (clientProfile.keySkillsToAcquire || []).join(' ').toLowerCase();
    const targetSites = this.getRelevantSources(userRole + " " + userSkills).slice(0, 10);
    
    // Costruzione Query "Anti-Corporate"
    const searchContext = `
      TARGET ROLE: ${clientProfile.dreamRole}
      SKILLS: ${(clientProfile.keySkillsToAcquire || []).join(', ')}

      --- 🕒 LIVE TIME CONTEXT ---
      CURRENT TIME: ${currentISO}
      OLDEST ALLOWED POST: ${pastDateISO}
      
      --- 🚫 ANTI-CORPORATE FIREWALL (STRICT) ---
      1. **NO INDEED:** Do NOT return any link from indeed.com (links are broken).
      2. **NO FULL-TIME:** Discard any job mentioning "Health Insurance", "401k", "PTO", "Benefits", "Career path".
      3. **NO EMPLOYMENT:** We are looking for **B2B Contracts / Freelance / Gigs**.
      
      --- 🎯 EFFORT TARGETING ---
      Mode: '${mode.toUpperCase()}'
      - **DAILY:** Micro-tasks, < 2 hours. Ex: "Fix bug", "Write article".
      - **WEEKLY:** Small projects, < 10 hours. Ex: "Landing page", "Setup".
      - **MONTHLY:** Retainers/Builds, < 40 hours total. Ex: "MVP", "Strategy".
      
      --- INSTRUCTIONS ---
      1. Search specifically on: ${targetSites.join(', ')}.
      2. Look for keywords: "Contract", "Freelance", "Project-based", "Flat fee".
      3. **Verify URL:** Must be a direct link to the platform (e.g. Upwork, Fiverr).
    `;

    try {
      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'sonar-pro', 
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: `${searchContext}\n\nTASK: Find 5 REAL, ACTIVE freelance opportunities matching '${mode}'.\n\nOUTPUT RULES:\n- JSON Array ONLY.\n- 'source_url' MUST be direct (NO Indeed).` }
          ],
          temperature: 0.1 // Minima creatività per massimo rigore
        },
        { headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' } }
      );

      const rawContent = response.data.choices[0].message.content;
      await this.processAndSaveOpportunities(rawContent, userId, mode);

    } catch (error: any) {
      console.error("❌ Perplexity API Error:", error.message);
    }
  }

  // ==================================================================================
  // 🧠 INTELLIGENZA FONTI (Filtraggio Indeed)
  // ==================================================================================
  private getRelevantSources(roleAndSkills: string): string[] {
      const list = Object.keys(sourcesMasterlist).length > 0 ? sourcesMasterlist : FALLBACK_SOURCES;
      
      // Funzione che rimuove attivamente Indeed e Glassdoor
      const cleanList = (arr: string[]) => (arr || []).filter(s => !s.includes('indeed') && !s.includes('glassdoor'));

      const aggregators = cleanList(list.aggregators || FALLBACK_SOURCES.aggregators);
      const general = cleanList(list.general_remote || FALLBACK_SOURCES.general_remote);
      
      let sources = [...aggregators, ...general];

      if (this.matches(roleAndSkills, ['dev', 'code', 'react', 'node'])) sources.push(...cleanList(list.tech_dev));
      if (this.matches(roleAndSkills, ['writ', 'content', 'copy'])) sources.push(...cleanList(list.writing_content));
      if (this.matches(roleAndSkills, ['design', 'ui', 'ux'])) sources.push(...cleanList(list.design_creative));
      if (this.matches(roleAndSkills, ['market', 'seo', 'sales'])) sources.push(...cleanList(list.marketing_sales));
      
      return [...new Set(sources)].sort(() => 0.5 - Math.random());
  }

  private matches(text: string, keywords: string[]): boolean {
      return keywords.some(k => text.includes(k));
  }

  // ==================================================================================
  // 💾 SALVATAGGIO TRANSAZIONALE (Nuclear Fix + Effort Data)
  // ==================================================================================
  private async processAndSaveOpportunities(rawJson: string, userId: string, type: 'daily' | 'weekly' | 'monthly') {
    try {
      let cleanContent = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      const firstBracket = cleanContent.indexOf('[');
      const lastBracket = cleanContent.lastIndexOf(']');
      
      if (firstBracket === -1 || lastBracket === -1) return;
      const missions = JSON.parse(cleanContent.substring(firstBracket, lastBracket + 1));
      
      let savedCount = 0;
      let maxCommands = type === 'weekly' ? 100 : (type === 'monthly' ? 400 : 20);

      // Calibrazione Ore (Stretta)
      let estimatedHours = 2; 
      if (type === 'weekly') estimatedHours = 8;
      if (type === 'monthly') estimatedHours = 40;

      await db.transaction().execute(async (trx) => {
          
          for (const m of missions) {
            const finalUrl = m.source_url || m.url || "#";
            
            // Validazione URL (Blocca Indeed a livello codice)
            if (!this.isValidJobUrl(finalUrl)) continue;

            const exists = await trx.selectFrom('missions').select('id').where('source_url', '=', finalUrl).executeTakeFirst();

            if (!exists) {
                // A. INSERIMENTO MISSIONE
                const newMission = await trx.insertInto('missions')
                  .values({
                    user_id: userId,
                    title: m.title || "Opportunità Freelance",
                    description: m.description || "Dettagli nel link.",
                    source_url: finalUrl,
                    source: this.detectPlatform(finalUrl),
                    reward_amount: this.parseReward(m.payout_estimation || m.budget),
                    estimated_duration_hours: estimatedHours,
                    status: 'pending',
                    type: type,
                    max_commands: maxCommands,
                    conversation_history: JSON.stringify([]),
                    platform: this.detectPlatform(finalUrl),
                    company_name: m.company_name || "Confidenziale",
                    match_score: m.match_score || 85,
                    raw_data: JSON.stringify({ tasks_breakdown: m.tasks_breakdown || [] }),
                    analysis_notes: m.analysis_notes || `Auto-detected`
                  })
                  .returning('id')
                  .executeTakeFirst();

                if (newMission && newMission.id) {
                    // B. CREAZIONE THREAD
                    await trx.insertInto('mission_threads')
                        .values({
                            mission_id: newMission.id,
                            user_id: userId,
                            role: 'system',
                            content: `Nuova Missione (${type}) rilevata: ${m.title}.`,
                            created_at: new Date()
                        })
                        .execute();

                    // C. AGGIORNAMENTO FILTRI (Raw SQL per evitare errori di tipo)
                    try {
                        await sql`
                            UPDATE mission_filters 
                            SET match_count = match_count + 1, last_match_at = NOW() 
                            WHERE user_id = ${userId} AND is_active = true
                        `.execute(trx);
                    } catch (e) {}
                    
                    savedCount++;
                }
            }
          }
      });

      console.log(`✅ [DB] Salvate ${savedCount} missioni freelance.`);

    } catch (e) {
      console.error("❌ [DB] Errore Transazione:", e);
    }
  }

  // --- UTILS ---

  private isValidJobUrl(url: string): boolean {
      if (!url || url.length < 10 || !url.startsWith('http')) return false;
      
      // Blacklist aggressiva contro Indeed e link spazzatura
      const blackList = [
          '/search', 'jobs?q=', 'login', 'signup', 
          'indeed.com',          // BANNATO
          'glassdoor.com',       // BANNATO
          'google.com/search',   // BANNATO
          'simplyhired.com'      // Spesso rotto
      ];
      
      if (blackList.some(p => url.includes(p))) {
          // console.log(`https://en.wikipedia.org/wiki/Filter_%28band%29 Scartato URL vietato: ${url}`);
          return false;
      }
      return true;
  }

  private detectPlatform(url: string): string {
      try { return new URL(url).hostname.replace('www.', '').split('.')[0]; } 
      catch (e) { return 'Web'; }
  }

  private parseReward(rewardString: string | number): number {
    if (typeof rewardString === 'number') return rewardString;
    if (!rewardString) return 10;
    const clean = rewardString.toString().replace(/[^0-9.]/g, '');
    return parseFloat(clean) || 10;
  }
}