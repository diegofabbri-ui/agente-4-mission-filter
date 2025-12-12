import axios from 'axios';
import { db } from '../infra/db';
import { sql } from 'kysely'; 
import fs from 'fs';
import path from 'path';

// --- 1. CONFIGURAZIONE "KILLER" DELLE FONTI ---
// Rimossi tutti gli aggregatori "sporchi" (Indeed, Glassdoor, Google Jobs).
// Ci concentriamo solo su piattaforme dove i clienti pagano o pubblicano direttamente.
const FALLBACK_SOURCES = {
    // Aggregatori "Puliti" (Pochi ma buoni)
    aggregators: ["linkedin.com/jobs", "weworkremotely.com", "remoteok.com"], 
    
    // Generalisti (Massa critica)
    general_remote: ["upwork.com/jobs", "freelancer.com/projects", "fiverr.com/buying"],
    
    // Verticali Tech (Alta qualità)
    tech_dev: ["stackoverflow.com/jobs", "gun.io", "toptal.com", "ycombinator.com/jobs"],
    
    // Verticali Content & Creative
    writing_content: ["problogger.com/jobs", "contently.net", "bestwriting.com/jobs"],
    design_creative: ["behance.net/joblist", "dribbble.com/jobs", "designjobs.board"],
    
    // Verticali Marketing
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
  // 🔍 CORE: LA CACCIA AL TESORO (Logic: "Client First")
  // ==================================================================================
  public async findGrowthOpportunities(userId: string, clientProfile: any, mode: 'daily' | 'weekly' | 'monthly' = 'daily') {
    
    const now = new Date();
    const currentISO = now.toISOString(); 
    
    // Calcolo Finestra Temporale (Strettissima per Daily)
    const lookbackDays = mode === 'daily' ? 1 : (mode === 'weekly' ? 3 : 7);
    const pastDate = new Date();
    pastDate.setDate(now.getDate() - lookbackDays);
    const pastDateISO = pastDate.toISOString();

    console.log(`🚀 [HUNTER] Caccia ${mode.toUpperCase()} iniziata | Target: CLIENTS ONLY | Time: ${currentISO}`);

    // Caricamento Prompt Operativi
    let systemInstruction = "";
    if (mode === 'weekly') systemInstruction = this.loadTextFile('system_headhunter_weekly.md');
    else if (mode === 'monthly') systemInstruction = this.loadTextFile('system_headhunter_monthly.md');
    else systemInstruction = this.loadTextFile('system_headhunter_prompt.md');

    if (!systemInstruction) systemInstruction = "You are an expert headhunter. Find active freelance jobs. Return strictly JSON.";

    // Selezione Fonti (Pulita da spazzatura)
    const userRole = (clientProfile.dreamRole || "freelancer").toLowerCase();
    const userSkills = (clientProfile.keySkillsToAcquire || []).join(' ').toLowerCase();
    const targetSites = this.getRelevantSources(userRole + " " + userSkills).slice(0, 12);
    
    // --- COSTRUZIONE QUERY "CHIRURGICA" ---
    const searchContext = `
      TARGET ROLE: ${clientProfile.dreamRole}
      SKILLS: ${(clientProfile.keySkillsToAcquire || []).join(', ')}

      --- 🕒 LIVE TIME CONTEXT ---
      CURRENT TIME: ${currentISO}
      OLDEST ALLOWED POST: ${pastDateISO}
      
      --- 🎯 HUNTING PROTOCOL (STRICT) ---
      1. **CLIENTS ONLY:** Find "Help Wanted" or "Hiring" posts. **IGNORE** freelancer profiles (e.g., "I am a dev", "My Resume").
      2. **NO FULL-TIME JOBS:** If it mentions "Benefits", "Health Insurance", "401k", "PTO", "Commute" -> **KILL IT**. We want B2B Contracts.
      3. **EFFORT CALIBRATION:**
         - **DAILY:** Max 2 hours (Quick fix, Script tweak, Edit).
         - **WEEKLY:** Max 8-10 hours (Landing page, Setup, Audit).
         - **MONTHLY:** Max 30-40 hours (MVP Build, Retainer, Strategy).
      
      --- INSTRUCTIONS ---
      1. Search specifically on: ${targetSites.join(', ')}.
      2. Look for keywords: "Contract", "Freelance", "Project-based", "Flat fee", "Urgent".
      3. **Verify URL:** Must be a direct link to the JOB POST (e.g. upwork.com/jobs/..., NOT indeed.com/...).
    `;

    try {
      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'sonar-pro', // Modello "Reasoning" per navigare meglio
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: `${searchContext}\n\nTASK: Find 5 REAL, ACTIVE, HIGH-VALUE freelance opportunities matching '${mode}'.\n\nOUTPUT RULES:\n- JSON Array ONLY.\n- 'source_url' MUST be direct (NO redirects).` }
          ],
          temperature: 0.1 // Creatività al minimo per evitare allucinazioni
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
  // 🧠 INTELLIGENZA FONTI (Filtraggio Aggressivo)
  // ==================================================================================
  private getRelevantSources(roleAndSkills: string): string[] {
      const list = Object.keys(sourcesMasterlist).length > 0 ? sourcesMasterlist : FALLBACK_SOURCES;
      
      // Funzione che rimuove siti "tossici" per un freelancer
      const cleanList = (arr: string[]) => (arr || []).filter(s => 
          !s.includes('indeed') && 
          !s.includes('glassdoor') &&
          !s.includes('google.com') && 
          !s.includes('simplyhired')
      );

      const aggregators = cleanList(list.aggregators || FALLBACK_SOURCES.aggregators);
      const general = cleanList(list.general_remote || FALLBACK_SOURCES.general_remote);
      
      let sources = [...aggregators, ...general];

      // Aggiunte verticali basate sulle skill
      if (this.matches(roleAndSkills, ['dev', 'code', 'react', 'node', 'fullstack'])) sources.push(...cleanList(list.tech_dev));
      if (this.matches(roleAndSkills, ['writ', 'content', 'copy', 'blog'])) sources.push(...cleanList(list.writing_content));
      if (this.matches(roleAndSkills, ['design', 'ui', 'ux', 'art'])) sources.push(...cleanList(list.design_creative));
      if (this.matches(roleAndSkills, ['market', 'seo', 'sales', 'growth'])) sources.push(...cleanList(list.marketing_sales));
      
      // Shuffle per non cercare sempre negli stessi posti
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

      // Calibrazione Ore (Stime difensive)
      let estimatedHours = 2; 
      if (type === 'weekly') estimatedHours = 8;
      if (type === 'monthly') estimatedHours = 40;

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
                            content: `Nuova Missione (${type.toUpperCase()}) intercettata: ${m.title}. (Stima: ${estimatedHours}h)`,
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
      
      // Blacklist aggressiva (Pattern da evitare come la peste)
      const blackList = [
          '/search', 'jobs?q=', 'login', 'signup', 
          'indeed.com',          // Bannato
          'glassdoor.com',       // Bannato
          'google.com/search',   // Bannato
          'profile', 'resume', 'cv', // Bannati i profili
          'freelancers'          // Bannati gli elenchi di freelancer
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