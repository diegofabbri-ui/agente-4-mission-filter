import axios from 'axios';
import { db } from '../infra/db';
import { sql } from 'kysely'; 
import fs from 'fs';
import path from 'path';

// --- 1. CONFIGURAZIONE FALLBACK (Salva-Ricerca) ---
const FALLBACK_SOURCES = {
    aggregators: ["google.com/search?ibp=htl;jobs", "linkedin.com/jobs", "indeed.com", "glassdoor.com"],
    general_remote: ["upwork.com/jobs", "freelancer.com/projects", "fiverr.com", "remoteok.com"],
    tech_dev: ["stackoverflow.com/jobs", "github.com/jobs", "toptal.com", "weworkremotely.com"],
    writing_content: ["problogger.com/jobs", "contently.net"],
    design_creative: ["behance.net/joblist", "dribbble.com/jobs"],
    marketing_sales: ["marketerhire.com", "growth.org/jobs"]
};

let sourcesMasterlist: any = FALLBACK_SOURCES;

// Caricamento resiliente della Masterlist
try {
    const pathsToTry = [
        path.join(process.cwd(), 'src', 'knowledge_base', 'sources_masterlist.json'),
        path.join(process.cwd(), 'dist', 'knowledge_base', 'sources_masterlist.json'),
        path.join(__dirname, '..', 'knowledge_base', 'sources_masterlist.json')
    ];
    
    for (const p of pathsToTry) {
        if (fs.existsSync(p)) {
            sourcesMasterlist = JSON.parse(fs.readFileSync(p, 'utf-8'));
            console.log(`✅ [SYSTEM] Masterlist fonti caricata da: ${p}`);
            break;
        }
    }
} catch (e) {
    console.warn("⚠️ [SYSTEM] Warning: sources_masterlist.json non trovato. Attivo Fallback Mode.");
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
  // 🔍 CORE: RICERCA OPPORTUNITÀ (Wide Net + Anti-Zombie + Effort Calibration)
  // ==================================================================================
  public async findGrowthOpportunities(userId: string, clientProfile: any, mode: 'daily' | 'weekly' | 'monthly' = 'daily') {
    
    // 1. TEMPO REALE
    const now = new Date();
    const currentISO = now.toISOString(); 
    
    // Calcolo Finestra Temporale
    const lookbackDays = mode === 'daily' ? 1 : (mode === 'weekly' ? 3 : 7);
    const pastDate = new Date();
    pastDate.setDate(now.getDate() - lookbackDays);
    const pastDateISO = pastDate.toISOString();

    console.log(`🚀 [HUNTER] Caccia ${mode.toUpperCase()} | Start: ${currentISO}`);

    // 2. Caricamento Prompt
    let systemInstruction = "";
    if (mode === 'weekly') systemInstruction = this.loadTextFile('system_headhunter_weekly.md');
    else if (mode === 'monthly') systemInstruction = this.loadTextFile('system_headhunter_monthly.md');
    else systemInstruction = this.loadTextFile('system_headhunter_prompt.md');

    if (!systemInstruction) systemInstruction = "You are an expert headhunter. Find active freelance jobs. Return strictly JSON.";

    // 3. Selezione Fonti
    const userRole = (clientProfile.dreamRole || "freelancer").toLowerCase();
    const userSkills = (clientProfile.keySkillsToAcquire || []).join(' ').toLowerCase();
    const targetSites = this.getRelevantSources(userRole + " " + userSkills).slice(0, 10);
    
    // 4. Costruzione Query con Calibrazione Sforzo (Effort)
    const searchContext = `
      TARGET ROLE: ${clientProfile.dreamRole}
      SKILLS: ${(clientProfile.keySkillsToAcquire || []).join(', ')}

      --- 🕒 LIVE TIME CONTEXT ---
      CURRENT TIME: ${currentISO}
      OLDEST ALLOWED POST: ${pastDateISO}
      
      --- 🎯 EFFORT CALIBRATION (CRITICAL) ---
      You are searching for '${mode.toUpperCase()}' Missions.
      - **DAILY Mode:** Look for "Flash Tasks" (Max 2 hours effort). Ex: Bug fixes, translation, small edits.
      - **WEEKLY Mode:** Look for "One-Day Projects" (Max 8 hours effort). Ex: Landing page, setup, automation.
      - **MONTHLY Mode:** Look for "Week-Long Projects" (Max 40 hours effort). Ex: MVP build, brand identity.
      
      --- 🚫 EXCLUSIONS ---
      - **NO Full-Time Jobs** (40h/week indefinite).
      - **NO "Job closed"** or "Expired" listings.
      
      --- INSTRUCTIONS ---
      1. Search on: ${targetSites.join(', ')} + Aggregators.
      2. Filter strictly by the Effort/Duration defined above.
      3. Verify freshness (must be newer than ${pastDateISO}).
    `;

    try {
      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'sonar-pro', 
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: `${searchContext}\n\nTASK: Find 5 REAL, OPEN job listings for '${mode}' mode.\n\nOUTPUT RULES:\n- JSON Array ONLY.\n- 'source_url' MUST be a direct deep link.` }
          ],
          temperature: 0.15 
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
  // 🧠 INTELLIGENZA FONTI
  // ==================================================================================
  private getRelevantSources(roleAndSkills: string): string[] {
      const list = Object.keys(sourcesMasterlist).length > 0 ? sourcesMasterlist : FALLBACK_SOURCES;
      const aggregators = list.aggregators || FALLBACK_SOURCES.aggregators || [];
      const general = list.general_remote || FALLBACK_SOURCES.general_remote || [];
      let sources = [...aggregators, ...general];

      if (this.matches(roleAndSkills, ['dev', 'code', 'react', 'node', 'fullstack'])) sources.push(...(list.tech_dev || []));
      if (this.matches(roleAndSkills, ['writ', 'content', 'copy', 'blog'])) sources.push(...(list.writing_content || []));
      if (this.matches(roleAndSkills, ['design', 'ui', 'ux', 'art'])) sources.push(...(list.design_creative || []));
      if (this.matches(roleAndSkills, ['market', 'seo', 'sales'])) sources.push(...(list.marketing_sales || []));
      
      return [...new Set(sources)].sort(() => 0.5 - Math.random());
  }

  private matches(text: string, keywords: string[]): boolean {
      return keywords.some(k => text.includes(k));
  }

  // ==================================================================================
  // 💾 SALVATAGGIO TRANSAZIONALE (Con Stime Orarie Aggiornate)
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

      // --- NUOVA CALIBRAZIONE ORE (Effort Logic) ---
      let estimatedHours = 2; // Default: Daily (Max 2h)
      if (type === 'weekly') estimatedHours = 8; // Max 1 Giorno lavorativo
      if (type === 'monthly') estimatedHours = 40; // Max 1 Settimana lavorativa

      // ESECUZIONE TRANSAZIONE
      await db.transaction().execute(async (trx) => {
          
          for (const m of missions) {
            const finalUrl = m.source_url || m.url || "#";
            if (!this.isValidJobUrl(finalUrl)) continue;

            const exists = await trx.selectFrom('missions').select('id').where('source_url', '=', finalUrl).executeTakeFirst();

            if (!exists) {
                // A. INSERIMENTO MISSIONE
                const newMission = await trx.insertInto('missions')
                  .values({
                    user_id: userId,
                    title: m.title || "Opportunità",
                    description: m.description || "Dettagli nel link.",
                    source_url: finalUrl,
                    source: this.detectPlatform(finalUrl),
                    reward_amount: this.parseReward(m.payout_estimation || m.budget),
                    estimated_duration_hours: estimatedHours, // <--- STIMA AGGIORNATA
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
                    // B. CREAZIONE THREAD (Sync Immediato)
                    await trx.insertInto('mission_threads')
                        .values({
                            mission_id: newMission.id,
                            user_id: userId,
                            role: 'system',
                            content: `Nuova Missione (${type.toUpperCase()}) Trovata: ${m.title}. Durata stimata: ${estimatedHours}h.`,
                            created_at: new Date()
                        })
                        .execute();

                    // C. AGGIORNAMENTO FILTRI
                    // Try-catch interno per sicurezza nel caso i tipi non siano ancora syncati al 100%
                    try {
                        await trx.updateTable('mission_filters')
                            .set({
                                match_count: sql`match_count + 1`,
                                last_match_at: new Date()
                            })
                            .where('user_id', '=', userId)
                            .where('is_active', '=', true)
                            .execute();
                    } catch (e) {
                        // Ignora errore filtri se la tabella non matcha, l'importante è salvare la missione
                    }
                    
                    savedCount++;
                }
            }
          }
      });

      console.log(`✅ [DB] Transazione Completata: ${savedCount} missioni salvate (Mode: ${type}).`);

    } catch (e) {
      console.error("❌ [DB] Errore Transazione:", e);
    }
  }

  // --- UTILS ---

  private isValidJobUrl(url: string): boolean {
      if (!url || url.length < 10 || !url.startsWith('http')) return false;
      if (url.includes('/search') || url.includes('?q=') || url.includes('login')) return false;
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