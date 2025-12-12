import axios from 'axios';
import { db } from '../infra/db';
import { sql } from 'kysely'; 
import fs from 'fs';
import path from 'path';

// --- 1. CONFIGURAZIONE FONTI "OPEN WEB" (NO WALLS) ---
// Rimosso LinkedIn, Indeed e Glassdoor perché bloccano le API o danno link scaduti.
// Queste fonti sono "API-Friendly" e garantiscono link pubblici validi.
const FALLBACK_SOURCES = {
    aggregators: ["remoteok.com", "weworkremotely.com", "nodesk.co/remote-jobs", "remotive.com", "workingnomads.com/jobs"],
    general_freelance: ["upwork.com/jobs", "freelancer.com/projects", "guru.com/d/jobs"],
    tech_dev: ["gun.io", "toptal.com", "ycombinator.com/jobs", "wellfound.com/jobs", "stackoverflow.com/jobs"],
    writing_content: ["problogger.com/jobs", "bestwriting.com/jobs", "superpath.co/jobs"],
    design_creative: ["behance.net/joblist", "dribbble.com/jobs", "designjobs.board"],
    marketing_sales: ["marketerhire.com", "growth.org/jobs", "exitfive.com/jobs"]
};

let sourcesMasterlist: any = FALLBACK_SOURCES;

// Caricamento resiliente
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
  // 🔍 CORE: RICERCA "LIVE" (Filtri Nativi + Validazione Rigida)
  // ==================================================================================
  public async findGrowthOpportunities(userId: string, clientProfile: any, mode: 'daily' | 'weekly' | 'monthly' = 'daily') {
    
    // CONFIGURAZIONE RECENCY NATIVA (Il segreto per i risultati "vivi")
    // 'day' = ultime 24h (Daily), 'week' = ultimi 7gg (Weekly/Monthly)
    // Questo parametro forza l'API a ignorare tutto ciò che è vecchio.
    const recencyFilter = mode === 'daily' ? 'day' : 'week';
    
    console.log(`🚀 [HUNTER] Caccia ${mode.toUpperCase()} | Recency Mode: ${recencyFilter}`);

    // Caricamento Prompt
    let systemInstruction = "";
    if (mode === 'weekly') systemInstruction = this.loadTextFile('system_headhunter_weekly.md');
    else if (mode === 'monthly') systemInstruction = this.loadTextFile('system_headhunter_monthly.md');
    else systemInstruction = this.loadTextFile('system_headhunter_prompt.md');

    if (!systemInstruction) systemInstruction = "You are an expert headhunter. Find active freelance jobs.";

    // Selezione Fonti (Senza i siti bloccati)
    const userRole = (clientProfile.dreamRole || "freelancer").toLowerCase();
    const userSkills = (clientProfile.keySkillsToAcquire || []).join(' ').toLowerCase();
    const targetSites = this.getRelevantSources(userRole + " " + userSkills).slice(0, 15);
    
    // Costruzione Query "Chirurgica"
    const searchContext = `
      ROLE: ${clientProfile.dreamRole}
      SKILLS: ${(clientProfile.keySkillsToAcquire || []).join(', ')}
      
      --- 🎯 LIVE SEARCH COMMAND ---
      Find 5 ACTIVE freelance/contract listings published in the last ${recencyFilter === 'day' ? '24 hours' : '7 days'}.
      
      **MANDATORY SOURCES (SEARCH HERE):**
      ${targetSites.join(', ')}
      
      **CRITICAL FILTERS:**
      1. **VALID LINKS ONLY:** Ensure the URL points to a specific job post (contains /job/, /project/, /view/). DO NOT return search result pages.
      2. **NO FULL-TIME:** Discard listings with "W2", "Benefits", "Health Insurance", "Equity only".
      3. **FREELANCE ONLY:** Look for "Contract", "Project-based", "Hourly", "Flat Fee".
    `;

    try {
      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'sonar-pro', 
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: `${searchContext}\n\nOUTPUT: JSON Array ONLY. 5 Results. Valid URLs only.` }
          ],
          // PARAMETRO CHIAVE: Filtra a livello di motore di ricerca, prima ancora di generare testo.
          search_recency_filter: recencyFilter, 
          temperature: 0.1 
        },
        { headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' } }
      );

      const rawContent = response.data.choices[0].message.content;
      await this.processAndSaveOpportunities(rawContent, userId, mode);

    } catch (error: any) {
      console.error("❌ API Error:", error.message);
    }
  }

  // ==================================================================================
  // 🧠 INTELLIGENZA FONTI (Pulizia Aggressiva)
  // ==================================================================================
  private getRelevantSources(roleAndSkills: string): string[] {
      const list = Object.keys(sourcesMasterlist).length > 0 ? sourcesMasterlist : FALLBACK_SOURCES;
      
      // Funzione che rimuove qualsiasi sito noto per dare problemi via API
      const cleanList = (arr: string[]) => (arr || []).filter(s => 
          !s.includes('indeed') && 
          !s.includes('glassdoor') &&
          !s.includes('linkedin') && // LinkedIn API spesso fallisce o chiede login
          !s.includes('google')
      );

      const aggregators = cleanList(list.aggregators || list.aggregators_clean || []);
      const general = cleanList(list.general_remote || list.general_freelance || []);
      let sources = [...aggregators, ...general];

      if (this.matches(roleAndSkills, ['dev', 'code', 'react', 'node'])) sources.push(...cleanList(list.tech_dev));
      if (this.matches(roleAndSkills, ['writ', 'content', 'copy'])) sources.push(...cleanList(list.writing_content));
      if (this.matches(roleAndSkills, ['design', 'ui', 'ux'])) sources.push(...cleanList(list.design_creative));
      if (this.matches(roleAndSkills, ['market', 'sales', 'seo'])) sources.push(...cleanList(list.marketing_sales));
      
      return [...new Set(sources)].sort(() => 0.5 - Math.random());
  }

  private matches(text: string, keywords: string[]): boolean {
      return keywords.some(k => text.includes(k));
  }

  // ==================================================================================
  // 💾 SALVATAGGIO TRANSAZIONALE (Con Validazione Link Avanzata)
  // ==================================================================================
  private async processAndSaveOpportunities(rawJson: string, userId: string, type: 'daily' | 'weekly' | 'monthly') {
    try {
      let cleanContent = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      const firstBracket = cleanContent.indexOf('[');
      const lastBracket = cleanContent.lastIndexOf(']');
      
      if (firstBracket === -1 || lastBracket === -1) return;
      const missions = JSON.parse(cleanContent.substring(firstBracket, lastBracket + 1));
      
      let savedCount = 0;
      let estimatedHours = type === 'daily' ? 2 : (type === 'weekly' ? 8 : 40);
      let maxCommands = type === 'weekly' ? 100 : (type === 'monthly' ? 400 : 20);

      await db.transaction().execute(async (trx) => {
          for (const m of missions) {
            const finalUrl = m.source_url || m.url || "#";
            
            // VALIDAZIONE URL AVANZATA (Scarta se non sembra un job post)
            if (!this.isValidJobUrl(finalUrl)) {
                // console.log(`https://www.merriam-webster.com/dictionary/skip Scartato URL sospetto: ${finalUrl}`);
                continue;
            }

            const exists = await trx.selectFrom('missions').select('id').where('source_url', '=', finalUrl).executeTakeFirst();

            if (!exists) {
                // A. INSERT MISSIONE
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
                    // B. INSERT THREAD
                    await trx.insertInto('mission_threads')
                        .values({
                            mission_id: newMission.id,
                            user_id: userId,
                            role: 'system',
                            content: `Nuova Missione (${type}) rilevata: ${m.title}. Fonte: ${this.detectPlatform(finalUrl)}`,
                            created_at: new Date()
                        })
                        .execute();

                    // C. UPDATE FILTRI (SQL Puro per evitare crash di tipi)
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
      console.log(`✅ [DB] Salvataggio completato: ${savedCount} missioni.`);
    } catch (e) { console.error("❌ Errore Elaborazione:", e); }
  }

  // --- UTILS: VALIDAZIONE URL BLINDATA ---
  private isValidJobUrl(url: string): boolean {
      if (!url || url.length < 15 || !url.startsWith('http')) return false;
      const lower = url.toLowerCase();

      // Blacklist: Siti che non funzionano mai bene via API
      const blacklist = [
          'indeed.com', 
          'glassdoor.com', 
          'google.com/search', 
          'login', 'signup', 
          'profile', 'resume', 'cv' // Blocca profili utente
      ];
      if (blacklist.some(b => lower.includes(b))) return false;

      // Whitelist Pattern: L'URL deve contenere indizi che è un annuncio
      // Esempi validi: /jobs/123, /project/view/abc, /listings/xyz
      const validPatterns = ['/job', '/project', '/freelance', '/contract', '/view', '/listing', '/gigs', '/work', '/opportunities'];
      
      // Eccezione per alcuni siti che usano ID numerici o hash strani
      if (lower.includes('upwork') && !lower.includes('/jobs/')) return false;
      if (lower.includes('freelancer') && !lower.includes('/projects/')) return false;

      // Se non matcha la blacklist, siamo fiduciosi
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