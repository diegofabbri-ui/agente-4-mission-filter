import axios from 'axios';
import { db } from '../infra/db';
import { sql } from 'kysely'; 
import fs from 'fs';
import path from 'path';

// --- 1. CONFIGURAZIONE "SURVIVAL KIT" (FALLBACK) ---
// Se il file JSON manca, usiamo questo kit di sopravvivenza con i migliori siti per categoria.
const FALLBACK_SOURCES = {
    aggregators_clean: ["linkedin.com/jobs", "remoteok.com", "weworkremotely.com", "nodesk.co/remote-jobs"],
    general_freelance: ["upwork.com/jobs", "freelancer.com/projects", "guru.com/d/jobs"],
    tech_dev: ["gun.io", "toptal.com", "ycombinator.com/jobs", "wellfound.com/jobs"],
    writing_content: ["problogger.com/jobs", "superpath.co/jobs", "bestwriting.com/jobs"],
    design_creative: ["behance.net/joblist", "dribbble.com/jobs", "designjobs.board"],
    marketing_sales: ["marketerhire.com", "growth.org/jobs", "exitfive.com/jobs"]
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
    console.warn("⚠️ [SYSTEM] Masterlist non trovata. Uso Fallback (Mode: SAFE).");
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
  // 🔍 CORE: RICERCA "HUNTER" (Diversificazione Forzata + Anti-Corporate)
  // ==================================================================================
  public async findGrowthOpportunities(userId: string, clientProfile: any, mode: 'daily' | 'weekly' | 'monthly' = 'daily') {
    
    const now = new Date();
    const currentISO = now.toISOString(); 
    
    // Calcolo Finestra Temporale (Daily è spietato: solo 24h)
    const lookbackDays = mode === 'daily' ? 1 : (mode === 'weekly' ? 3 : 7);
    const pastDate = new Date();
    pastDate.setDate(now.getDate() - lookbackDays);
    const pastDateISO = pastDate.toISOString();

    console.log(`🚀 [HUNTER] Caccia ${mode.toUpperCase()} | Start: ${currentISO}`);

    // Caricamento Prompt Operativi
    let systemInstruction = "";
    if (mode === 'weekly') systemInstruction = this.loadTextFile('system_headhunter_weekly.md');
    else if (mode === 'monthly') systemInstruction = this.loadTextFile('system_headhunter_monthly.md');
    else systemInstruction = this.loadTextFile('system_headhunter_prompt.md');

    if (!systemInstruction) systemInstruction = "You are an expert headhunter. Find active freelance jobs. Return strictly JSON.";

    // --- SELEZIONE FONTI "MIXATA" (Anti-Monopolio WWR) ---
    const userRole = (clientProfile.dreamRole || "freelancer").toLowerCase();
    const userSkills = (clientProfile.keySkillsToAcquire || []).join(' ').toLowerCase();
    
    // Otteniamo il mix forzato (Aggregatori + Generalisti + Nicchia)
    const targetSites = this.getDiversifiedSources(userRole + " " + userSkills);
    
    // Costruzione Query "Freelancer Mindset"
    const searchContext = `
      TARGET ROLE: ${clientProfile.dreamRole}
      SKILLS: ${(clientProfile.keySkillsToAcquire || []).join(', ')}

      --- 🕒 LIVE TIME CONTEXT ---
      CURRENT TIME: ${currentISO}
      OLDEST ALLOWED POST: ${pastDateISO}
      
      --- 🎯 DIVERSIFICATION PROTOCOL (MANDATORY) ---
      **DO NOT just use WeWorkRemotely.** You must scan this mix:
      1. **Aggregators:** ${targetSites.aggregators.join(', ')}
      2. **Freelance Marketplaces:** ${targetSites.general.join(', ')}
      3. **Niche Boards (High Priority):** ${targetSites.niche.join(', ')}
      
      --- 🚫 THE "NO-BS" FILTERS ---
      1. **NO DEAD LINKS:** Do NOT return Indeed, Glassdoor, or Google Jobs links.
      2. **NO CORPORATE JOBS:** If it says "Benefits", "Health Insurance", "401k", or "Full Time Employee" -> **KILL IT**. We want B2B Contracts.
      3. **NO PROFILES:** Ignore "I am a developer". Find "Hiring a developer".
      
      --- 🎯 EFFORT CALIBRATION ---
      - **DAILY:** Max 2h (Quick fix).
      - **WEEKLY:** Max 10h (Small project).
      - **MONTHLY:** Max 40h (Retainer/Build).
      
      --- INSTRUCTIONS ---
      1. Find 5 active listings matching '${mode.toUpperCase()}'.
      2. **Spread results:** Try to pick at least 1 from a Niche Board.
      3. **Verify URL:** Must be a direct link to the JOB POST.
    `;

    try {
      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'sonar-pro', // Modello "Reasoning" per navigare meglio
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: `${searchContext}\n\nTASK: Find 5 REAL, ACTIVE, HIGH-VALUE freelance opportunities. DIVERSIFY SOURCES.\n\nOUTPUT RULES:\n- JSON Array ONLY.\n- 'source_url' MUST be direct.` }
          ],
          temperature: 0.2 // Basso per precisione, ma non 0 per permettere un po' di esplorazione fonti
        },
        { headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' } }
      );

      const rawContent = response.data.choices[0].message.content;
      await this.processAndSaveOpportunities(rawContent, userId, mode);

    } catch (error: any) {
      console.error("❌ [ERROR] Perplexity API Failed:", error.message);
    }
  }

  // ==================================================================================
  // 🧠 INTELLIGENZA FONTI (Mixer Bilanciato)
  // ==================================================================================
  private getDiversifiedSources(roleAndSkills: string): { aggregators: string[], general: string[], niche: string[] } {
      const list = Object.keys(sourcesMasterlist).length > 0 ? sourcesMasterlist : FALLBACK_SOURCES;
      
      // Helper per prendere N elementi random
      const pick = (arr: string[], count: number) => (arr || []).sort(() => 0.5 - Math.random()).slice(0, count);

      // 1. Aggregatori (Prendi 3)
      const aggregators = pick(list.aggregators_clean || FALLBACK_SOURCES.aggregators_clean, 3);
      
      // 2. Generalisti (Prendi 3)
      const general = pick(list.general_freelance || FALLBACK_SOURCES.general_freelance, 3);

      // 3. Nicchia (Logica semantica)
      let nichePool: string[] = [];
      
      if (this.matches(roleAndSkills, ['dev', 'code', 'react', 'node', 'software', 'engineer', 'tech'])) {
          nichePool.push(...(list.tech_dev || []));
      }
      if (this.matches(roleAndSkills, ['writ', 'content', 'copy', 'blog', 'editor'])) {
          nichePool.push(...(list.writing_content || []));
      }
      if (this.matches(roleAndSkills, ['design', 'ui', 'ux', 'art', 'graphic', 'creative'])) {
          nichePool.push(...(list.design_creative || []));
      }
      if (this.matches(roleAndSkills, ['market', 'seo', 'sales', 'growth', 'ads'])) {
          nichePool.push(...(list.marketing_sales || []));
      }
      if (this.matches(roleAndSkills, ['crypto', 'web3', 'blockchain', 'defi'])) {
          nichePool.push(...(list.crypto_web3 || []));
      }
      if (this.matches(roleAndSkills, ['ai', 'data', 'machine', 'learning'])) {
          nichePool.push(...(list.ai_data || []));
      }

      // Fallback Nicchia se vuoto
      if (nichePool.length === 0) nichePool = list.tech_dev || [];

      return {
          aggregators: aggregators,
          general: general,
          niche: pick(nichePool, 4) // Prendi 4 siti di nicchia a caso
      };
  }

  private matches(text: string, keywords: string[]): boolean {
      return keywords.some(k => text.includes(k));
  }

  // ==================================================================================
  // 💾 SALVATAGGIO TRANSAZIONALE (Nuclear Fix + Effort Data)
  // ==================================================================================
  private async processAndSaveOpportunities(rawJson: string, userId: string, type: 'daily' | 'weekly' | 'monthly') {
    try {
      // 1. Pulizia JSON
      let cleanContent = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      const firstBracket = cleanContent.indexOf('[');
      const lastBracket = cleanContent.lastIndexOf(']');
      
      if (firstBracket === -1 || lastBracket === -1) {
          console.warn("⚠️ [DATA] Nessun JSON valido trovato nella risposta.");
          return;
      }
      
      const missions = JSON.parse(cleanContent.substring(firstBracket, lastBracket + 1));
      
      let savedCount = 0;
      let maxCommands = type === 'weekly' ? 100 : (type === 'monthly' ? 400 : 20);
      let estimatedHours = type === 'daily' ? 2 : (type === 'weekly' ? 8 : 40);

      // 2. Transazione Database
      await db.transaction().execute(async (trx) => {
          
          for (const m of missions) {
            const finalUrl = m.source_url || m.url || "#";
            
            // Validazione URL (Doppio controllo sicurezza)
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
                            content: `Nuova Missione (${type.toUpperCase()}) rilevata: ${m.title}. Fonte: ${this.detectPlatform(finalUrl)}`,
                            created_at: new Date()
                        })
                        .execute();

                    // C. AGGIORNAMENTO FILTRI (Fix "Nucleare" Raw SQL)
                    try {
                        await sql`
                            UPDATE mission_filters 
                            SET match_count = match_count + 1, last_match_at = NOW() 
                            WHERE user_id = ${userId} AND is_active = true
                        `.execute(trx);
                    } catch (e) {
                        // Silenzia errore filtri se tabella disallineata, la missione è salva.
                    }
                    
                    savedCount++;
                }
            }
          }
      });

      console.log(`✅ [DB] Salvataggio completato: ${savedCount} nuove missioni (${type}).`);

    } catch (e) {
      console.error("❌ [DB] Errore Transazione:", e);
    }
  }

  // --- UTILS ---

  private isValidJobUrl(url: string): boolean {
      if (!url || url.length < 10 || !url.startsWith('http')) return false;
      
      const lowerUrl = url.toLowerCase();
      
      // Blacklist aggressiva (Pattern da evitare)
      const blackList = [
          '/search', 'jobs?q=', 'login', 'signup', 
          'indeed.com',          // BANNATO
          'glassdoor.com',       // BANNATO
          'google.com/search',   // BANNATO
          'simplyhired.com',     // BANNATO
          'profile', 'resume', 'cv', // BANNATI I PROFILI
          'freelancers'          // BANNATI GLI ELENCHI DI TALENTI
      ];
      
      if (blackList.some(p => lowerUrl.includes(p))) {
          // console.log(`https://en.wikipedia.org/wiki/Filter_%28band%29 Scartato link tossico: ${url}`);
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