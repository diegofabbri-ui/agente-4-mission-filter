import axios from 'axios';
import { db } from '../infra/db';
import { sql } from 'kysely'; 
import fs from 'fs';
import path from 'path';

// --- CONFIGURAZIONE FALLBACK ---
const FALLBACK_SOURCES = {
    aggregators: ["google.com/search?ibp=htl;jobs", "linkedin.com/jobs", "indeed.com", "glassdoor.com"],
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
            console.log(`✅ [SYSTEM] Masterlist caricata: ${p}`);
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
  // 🔍 CORE: RICERCA "WIDE NET" + "ANTI-ZOMBIE"
  // ==================================================================================
  public async findGrowthOpportunities(userId: string, clientProfile: any, mode: 'daily' | 'weekly' | 'monthly' = 'daily') {
    
    // 1. TEMPO REALE
    const now = new Date();
    const currentISO = now.toISOString();
    
    const lookbackDays = mode === 'daily' ? 1 : (mode === 'weekly' ? 3 : 7);
    const pastDate = new Date();
    pastDate.setDate(now.getDate() - lookbackDays);
    const pastDateISO = pastDate.toISOString();

    console.log(`🚀 [HUNTER] Caccia ${mode.toUpperCase()} | Start: ${currentISO}`);

    // 2. Prompt
    let systemInstruction = "";
    if (mode === 'weekly') systemInstruction = this.loadTextFile('system_headhunter_weekly.md');
    else if (mode === 'monthly') systemInstruction = this.loadTextFile('system_headhunter_monthly.md');
    else systemInstruction = this.loadTextFile('system_headhunter_prompt.md');

    if (!systemInstruction) systemInstruction = "You are a headhunter. Find active freelance jobs.";

    // 3. Fonti
    const userRole = (clientProfile.dreamRole || "freelancer").toLowerCase();
    const userSkills = (clientProfile.keySkillsToAcquire || []).join(' ').toLowerCase();
    const targetSites = this.getRelevantSources(userRole + " " + userSkills).slice(0, 10);
    
    // 4. Query
    const searchContext = `
      TARGET ROLE: ${clientProfile.dreamRole}
      SKILLS: ${(clientProfile.keySkillsToAcquire || []).join(', ')}

      --- 🕒 LIVE TIME CONTEXT ---
      NOW: ${currentISO}
      OLDEST ALLOWED: ${pastDateISO}
      
      --- 🎯 INSTRUCTIONS ---
      1. Search on: ${targetSites.join(', ')} + Aggregators.
      2. **TIME FILTER:** Ignore jobs older than ${lookbackDays} days.
      3. **ANTI-ZOMBIE:** EXCLUDE pages with "Job closed", "Expired", "Filled".
      4. **VERIFICATION:** Check the "Posted" date carefully.
    `;

    try {
      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'sonar-pro',
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: `${searchContext}\n\nTASK: Find 5 REAL, ACTIVE job listings matching '${mode}'.\n\nOUTPUT: JSON Array ONLY. 'source_url' must be direct.` }
          ],
          temperature: 0.15 
        },
        { headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' } }
      );

      const rawContent = response.data.choices[0].message.content;
      await this.processAndSaveOpportunities(rawContent, userId, mode);

    } catch (error: any) {
      console.error("❌ API Error:", error.message);
    }
  }

  private getRelevantSources(roleAndSkills: string): string[] {
      const list = Object.keys(sourcesMasterlist).length > 0 ? sourcesMasterlist : FALLBACK_SOURCES;
      const aggregators = list.aggregators || FALLBACK_SOURCES.aggregators || [];
      const general = list.general_remote || FALLBACK_SOURCES.general_remote || [];
      let sources = [...aggregators, ...general];

      if (this.matches(roleAndSkills, ['dev', 'code', 'react', 'node'])) sources.push(...(list.tech_dev || []));
      if (this.matches(roleAndSkills, ['writ', 'content', 'copy'])) sources.push(...(list.writing_content || []));
      if (this.matches(roleAndSkills, ['design', 'ui', 'ux'])) sources.push(...(list.design_creative || []));
      
      return [...new Set(sources)].sort(() => 0.5 - Math.random());
  }

  private matches(text: string, keywords: string[]): boolean {
      return keywords.some(k => text.includes(k));
  }

  // ==================================================================================
  // 💾 SALVATAGGIO TRANSAZIONALE (FIX BUILD: TYPE CASTING)
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

      // --- TRANSAZIONE ---
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
                    estimated_duration_hours: m.hours || (type === 'weekly' ? 10 : 2),
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
                    // B. INSERIMENTO THREAD
                    await trx.insertInto('mission_threads')
                        .values({
                            mission_id: newMission.id,
                            user_id: userId,
                            role: 'system',
                            content: `Missione trovata: ${m.title}`,
                            created_at: new Date()
                        })
                        .execute();

                    // C. AGGIORNAMENTO FILTRI (FIX COMPILAZIONE)
                    // Usiamo (trx as any) per bypassare il controllo rigido dei tipi di TypeScript
                    // su 'mission_filters' nel caso il file types/db.ts non sia aggiornato su Railway.
                    try {
                        await (trx as any).updateTable('mission_filters')
                            .set({
                                match_count: sql`match_count + 1`,
                                last_match_at: new Date()
                            })
                            .where('user_id', '=', userId)
                            .where('is_active', '=', true)
                            .execute();
                    } catch (ignore) {
                        // Ignora se la tabella non si trova, non bloccare la transazione
                        console.warn("⚠️ Filtro non aggiornato (Type/DB mismatch)");
                    }
                    
                    savedCount++;
                }
            }
          }
      });

      console.log(`✅ Transazione Completata: ${savedCount} missioni salvate.`);

    } catch (e) {
      console.error("❌ Errore Transazione:", e);
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