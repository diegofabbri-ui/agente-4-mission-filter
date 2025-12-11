import axios from 'axios';
import { db } from '../infra/db';
import { sql } from 'kysely'; // Necessario per l'incremento atomico
import fs from 'fs';
import path from 'path';

// --- 1. CONFIGURAZIONE ROBUSTA MASTERLIST & FALLBACK ---
const FALLBACK_SOURCES = {
    aggregators: ["google.com/search?ibp=htl;jobs", "linkedin.com/jobs", "indeed.com", "glassdoor.com"],
    general_remote: ["upwork.com/jobs", "freelancer.com/projects", "fiverr.com", "remoteok.com"],
    tech_dev: ["stackoverflow.com/jobs", "github.com/jobs", "toptal.com", "weworkremotely.com"],
    writing_content: ["problogger.com/jobs", "contently.net"],
    design_creative: ["behance.net/joblist", "dribbble.com/jobs"],
    marketing_sales: ["marketerhire.com", "growth.org/jobs"]
};

let sourcesMasterlist: any = FALLBACK_SOURCES;

// Caricamento resiliente della Masterlist (tenta più percorsi)
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
  // 🔍 CORE: RICERCA OPPORTUNITÀ (Anti-Zombie + Transactional)
  // ==================================================================================
  public async findGrowthOpportunities(userId: string, clientProfile: any, mode: 'daily' | 'weekly' | 'monthly' = 'daily') {
    
    // 1. TEMPO REALE (Atomic Time per Filtro Scadenza)
    const now = new Date();
    const currentISO = now.toISOString(); 
    
    // Calcolo Finestra Temporale (Lookback)
    const lookbackDays = mode === 'daily' ? 1 : (mode === 'weekly' ? 3 : 7);
    const pastDate = new Date();
    pastDate.setDate(now.getDate() - lookbackDays);
    const pastDateISO = pastDate.toISOString();

    console.log(`🚀 [HUNTER] Start Caccia ${mode.toUpperCase()} | Server Time: ${currentISO}`);

    // 2. Caricamento Prompt (Manuali Operativi)
    let systemInstruction = "";
    if (mode === 'weekly') systemInstruction = this.loadTextFile('system_headhunter_weekly.md');
    else if (mode === 'monthly') systemInstruction = this.loadTextFile('system_headhunter_monthly.md');
    else systemInstruction = this.loadTextFile('system_headhunter_prompt.md');

    if (!systemInstruction) systemInstruction = "You are an expert headhunter. Find active freelance jobs. Return strictly JSON.";

    // 3. Selezione Fonti Dinamica (In base al Ruolo)
    const userRole = (clientProfile.dreamRole || "freelancer").toLowerCase();
    const userSkills = (clientProfile.keySkillsToAcquire || []).join(' ').toLowerCase();
    
    // Prendiamo i top 10 siti più rilevanti per questo utente
    const targetSites = this.getRelevantSources(userRole + " " + userSkills).slice(0, 10);
    
    // 4. Costruzione Query "Smart Filter"
    // Combina la ricerca ampia (Wide Net) con filtri di esclusione (Anti-Zombie)
    const searchContext = `
      TARGET ROLE: ${clientProfile.dreamRole}
      SKILLS: ${(clientProfile.keySkillsToAcquire || []).join(', ')}

      --- 🕒 LIVE TIME CONTEXT (STRICT) ---
      CURRENT TIME: ${currentISO}
      OLDEST ALLOWED POST: ${pastDateISO}
      
      --- 🎯 SEARCH PROTOCOL ---
      1. **SOURCES:** Prioritize these niche sites: ${targetSites.join(', ')}. Also scan major aggregators.
      2. **FRESHNESS FILTER:** Only accept jobs posted AFTER ${pastDateISO}.
      3. **ANTI-ZOMBIE FILTER:** DISCARD any page containing:
         - "Job closed"
         - "No longer accepting applications"
         - "This job has expired"
         - "Filled"
      4. **VERIFICATION:** If the post date says "5 days ago" and limit is 24h, DISCARD IT.
    `;

    try {
      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'sonar-pro', // Modello top-tier per la ricerca
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: `${searchContext}\n\nTASK: Find 5 REAL, OPEN, and ACTIONABLE job listings for '${mode}' mode.\n\nOUTPUT RULES:\n- JSON Array ONLY.\n- 'source_url' MUST be a direct deep link to the job (no search pages).\n- If uncertain about status, DO NOT include.` }
          ],
          temperature: 0.15 // Leggermente sopra lo 0 per permettere flessibilità nella ricerca, ma bassa per rigore nei dati
        },
        { headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' } }
      );

      const rawContent = response.data.choices[0].message.content;
      console.log(`📡 [HUNTER] Risposta AI ricevuta (${rawContent.length} chars). Avvio Transactional Save...`);
      
      await this.processAndSaveOpportunities(rawContent, userId, mode);

    } catch (error: any) {
      console.error("❌ [ERROR] Perplexity API Critical Fail:", error.response?.data || error.message);
    }
  }

  // ==================================================================================
  // 🧠 INTELLIGENZA FONTI (Matching Dinamico)
  // ==================================================================================
  private getRelevantSources(roleAndSkills: string): string[] {
      // Usa masterlist caricata o fallback
      const list = Object.keys(sourcesMasterlist).length > 0 ? sourcesMasterlist : FALLBACK_SOURCES;
      
      // Accesso sicuro alle proprietà (anche se undefined nel JSON)
      const aggregators = list.aggregators || FALLBACK_SOURCES.aggregators || [];
      const general = list.general_remote || FALLBACK_SOURCES.general_remote || [];

      let sources = [...aggregators, ...general];

      // Matching semantico per nicchie
      if (this.matches(roleAndSkills, ['dev', 'code', 'react', 'node', 'fullstack', 'engineer', 'software'])) {
          sources.push(...(list.tech_dev || FALLBACK_SOURCES.tech_dev || []));
      }
      if (this.matches(roleAndSkills, ['writ', 'content', 'copy', 'blog', 'editor', 'journal'])) {
          sources.push(...(list.writing_content || FALLBACK_SOURCES.writing_content || []));
      }
      if (this.matches(roleAndSkills, ['design', 'ui', 'ux', 'art', 'graphic', 'creative'])) {
          sources.push(...(list.design_creative || FALLBACK_SOURCES.design_creative || []));
      }
      if (this.matches(roleAndSkills, ['market', 'seo', 'sales', 'growth', 'ads'])) {
          sources.push(...(list.marketing_sales || FALLBACK_SOURCES.marketing_sales || []));
      }
      
      // Shuffle per variare le fonti ad ogni ricerca
      return [...new Set(sources)].sort(() => 0.5 - Math.random());
  }

  private matches(text: string, keywords: string[]): boolean {
      return keywords.some(k => text.includes(k));
  }

  // ==================================================================================
  // 💾 SALVATAGGIO TRANSAZIONALE (La parte più importante per il DB)
  // ==================================================================================
  private async processAndSaveOpportunities(rawJson: string, userId: string, type: 'daily' | 'weekly' | 'monthly') {
    try {
      // 1. Pulizia JSON (Rimuove markdown e testo spurio)
      let cleanContent = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      const firstBracket = cleanContent.indexOf('[');
      const lastBracket = cleanContent.lastIndexOf(']');
      
      if (firstBracket === -1 || lastBracket === -1) {
          console.warn("⚠️ [DATA] Nessun JSON valido trovato nella risposta AI.");
          return;
      }
      
      const jsonStr = cleanContent.substring(firstBracket, lastBracket + 1);
      let missions = [];
      try { missions = JSON.parse(jsonStr); } catch (e) { return; }

      if (missions.length === 0) {
          console.warn("⚠️ [DATA] 0 missioni trovate. I filtri potrebbero essere troppo restrittivi o la fonte è vuota.");
          return;
      }

      let savedCount = 0;
      let maxCommands = type === 'weekly' ? 100 : (type === 'monthly' ? 400 : 20);

      // 2. ESECUZIONE TRANSAZIONE ATOMICA
      // Tutto o niente: Missione, Thread e Filtri vengono aggiornati insieme.
      await db.transaction().execute(async (trx) => {
          
          for (const m of missions) {
            const finalUrl = m.source_url || m.url || "#";
            
            // Validazione URL (Soft check per non scartare troppo)
            if (!this.isValidJobUrl(finalUrl)) continue;

            // Check Duplicati
            const exists = await trx.selectFrom('missions').select('id').where('source_url', '=', finalUrl).executeTakeFirst();

            if (!exists) {
                // A. INSERT MISSIONE
                const newMission = await trx.insertInto('missions')
                  .values({
                    user_id: userId,
                    title: m.title || "Nuova Opportunità",
                    description: m.description || "Dettagli non disponibili.",
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
                    analysis_notes: m.analysis_notes || `Auto-detected: ${new Date().toLocaleDateString()}`
                  })
                  .returning('id')
                  .executeTakeFirst();

                if (newMission && newMission.id) {
                    // B. INSERT THREAD (Sync immediato)
                    await trx.insertInto('mission_threads')
                        .values({
                            mission_id: newMission.id,
                            user_id: userId,
                            title: m.title || "Discussione Missione",
                            created_at: new Date(),
                            updated_at: new Date()
                        })
                        .execute();

                    // C. UPDATE FILTRI (Incrementa contatore per il filtro attivo)
                    // Aggiorna il filtro attivo dell'utente per riflettere che ha trovato nuovi match
                    await trx.updateTable('mission_filters')
                        .set({
                            match_count: sql`match_count + 1`,
                            last_match_at: new Date()
                        })
                        .where('user_id', '=', userId)
                        .where('is_active', '=', true)
                        .execute();
                    
                    savedCount++;
                }
            }
          }
      });

      console.log(`✅ [DB] Transazione Completata: ${savedCount} missioni, thread e filtri aggiornati.`);

    } catch (e) {
      console.error("❌ [DB] Errore Transazione:", e);
    }
  }

  // --- UTILS ---

  private isValidJobUrl(url: string): boolean {
      if (!url || url.length < 10 || !url.startsWith('http')) return false;
      // Scarta solo pagine di login o ricerca palesi
      if (url.includes('login') || url.includes('signup') || url.includes('?q=')) return false;
      return true;
  }

  private detectPlatform(url: string): string {
      try { return new URL(url).hostname.replace('www.', '').split('.')[0]; } 
      catch (e) { return 'Web'; }
  }

  private parseReward(rewardString: string | number): number {
    if (typeof rewardString === 'number') return rewardString;
    if (!rewardString) return 10; // Default placeholder
    const clean = rewardString.toString().replace(/[^0-9.]/g, '');
    return parseFloat(clean) || 10;
  }
}