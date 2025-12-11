import axios from 'axios';
import { db } from '../infra/db';
import fs from 'fs';
import path from 'path';

// --- CONFIGURAZIONE ROBUSTA MASTERLIST & FALLBACK ---
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
    // Cerchiamo il file in più percorsi possibili per compatibilità Dev/Prod
    const pathsToTry = [
        path.join(process.cwd(), 'src', 'knowledge_base', 'sources_masterlist.json'),
        path.join(process.cwd(), 'dist', 'knowledge_base', 'sources_masterlist.json'),
        path.join(__dirname, '..', 'knowledge_base', 'sources_masterlist.json')
    ];
    
    for (const p of pathsToTry) {
        if (fs.existsSync(p)) {
            sourcesMasterlist = JSON.parse(fs.readFileSync(p, 'utf-8'));
            console.log(`✅ Masterlist caricata correttamente da: ${p}`);
            break;
        }
    }
} catch (e) {
    console.warn("⚠️ Warning: sources_masterlist.json non trovato. Uso Fallback di emergenza.");
}

export class PerplexityService {
  private apiKey: string;
  private kbPath: string;

  constructor() {
    this.apiKey = process.env.PERPLEXITY_API_KEY || '';
    
    // Gestione path per ambiente Produzione (dist) vs Sviluppo (src)
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
  // 🔍 CORE: RICERCA OPPORTUNITÀ "ANTI-ZOMBIE" (REAL-TIME)
  // ==================================================================================
  public async findGrowthOpportunities(userId: string, clientProfile: any, mode: 'daily' | 'weekly' | 'monthly' = 'daily') {
    
    // 1. CALCOLO TEMPO REALE (AL SECONDO)
    const now = new Date();
    const currentISO = now.toISOString(); // Es: 2025-12-11T14:30:45.123Z
    
    // Calcolo Data Limite (Lookback)
    const lookbackDays = mode === 'daily' ? 1 : (mode === 'weekly' ? 3 : 7);
    const pastDate = new Date();
    pastDate.setDate(now.getDate() - lookbackDays);
    const pastDateISO = pastDate.toISOString();

    console.log(`🚀 [HUNTER] Caccia ${mode.toUpperCase()} | Now: ${currentISO} | Limit: ${pastDateISO}`);

    // 2. Caricamento Manuale Prompt
    let systemInstruction = "";
    if (mode === 'weekly') systemInstruction = this.loadTextFile('system_headhunter_weekly.md');
    else if (mode === 'monthly') systemInstruction = this.loadTextFile('system_headhunter_monthly.md');
    else systemInstruction = this.loadTextFile('system_headhunter_prompt.md');

    if (!systemInstruction) systemInstruction = "You are a headhunter. Find active freelance jobs. Return strictly JSON.";

    // 3. Selezione Fonti Intelligente & Dinamica
    const userRole = (clientProfile.dreamRole || "freelancer").toLowerCase();
    const userSkills = (clientProfile.keySkillsToAcquire || []).join(' ').toLowerCase();
    
    // Prendiamo max 12 siti mirati + aggregatori per non rompere la query
    const targetSites = this.getRelevantSources(userRole + " " + userSkills).slice(0, 12);
    
    // 4. COSTRUZIONE QUERY BLINDATA (ANTI-SCADENZA)
    const searchContext = `
      TARGET ROLE: ${clientProfile.dreamRole}
      SKILLS: ${(clientProfile.keySkillsToAcquire || []).join(', ')}

      --- 🕒 LIVE TIME CONTEXT (CRITICAL) ---
      CURRENT SERVER TIME: ${currentISO}
      OLDEST ALLOWED DATE: ${pastDateISO}
      
      --- 🎯 SEARCH INSTRUCTIONS ---
      1. Search ONLY on these platforms: ${targetSites.join(', ')} and major job boards.
      2. **TIME FILTER:** Ignore ANY result posted before ${pastDateISO}.
      3. **"ZOMBIE" FILTER (KILL LIST):** DISCARD any page containing these phrases:
         - "Job is no longer available"
         - "Applications closed"
         - "This job has expired"
         - "No longer accepting applications"
         - "Filled"
      4. **VERIFICATION:** Check the "Posted" date relative to CURRENT SERVER TIME. If it says "3 days ago" and mode is 'daily', DISCARD.
    `;

    try {
      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'sonar-pro', // Modello con accesso web live
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: `${searchContext}\n\nTASK: Find 5 REAL, OPEN job listings for '${mode}' mode.\n\nOUTPUT RULES:\n- Return ONLY a valid JSON Array.\n- 'source_url' MUST be a direct deep link.\n- If uncertain about status (Open/Closed), DO NOT include.` }
          ],
          temperature: 0.1 // Minima creatività per massimizzare la precisione dei fatti
        },
        { headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' } }
      );

      const rawContent = response.data.choices[0].message.content;
      console.log(`📡 Risposta ricevuta (${rawContent.length} chars). Parsing...`);
      
      await this.processAndSaveOpportunities(rawContent, userId, mode);

    } catch (error: any) {
      console.error("❌ Errore Perplexity API:", error.response?.data || error.message);
    }
  }

  // ==================================================================================
  // 🧠 INTELLIGENZA FONTI (Con Fallback Sicuro)
  // ==================================================================================
  private getRelevantSources(roleAndSkills: string): string[] {
      // Usa masterlist caricata o fallback
      const list = Object.keys(sourcesMasterlist).length > 0 ? sourcesMasterlist : FALLBACK_SOURCES;
      
      // Accesso sicuro alle proprietà (anche se undefined nel JSON)
      const aggregators = list.aggregators || FALLBACK_SOURCES.aggregators || [];
      const general = list.general_remote || FALLBACK_SOURCES.general_remote || [];

      let sources = [...aggregators, ...general];

      // Matching semantico per nicchie
      if (this.matches(roleAndSkills, ['dev', 'code', 'react', 'node', 'fullstack', 'engineer'])) {
          sources.push(...(list.tech_dev || FALLBACK_SOURCES.tech_dev || []));
      }
      if (this.matches(roleAndSkills, ['writ', 'content', 'copy', 'blog', 'editor'])) {
          sources.push(...(list.writing_content || FALLBACK_SOURCES.writing_content || []));
      }
      if (this.matches(roleAndSkills, ['design', 'ui', 'ux', 'art', 'graphic'])) {
          sources.push(...(list.design_creative || FALLBACK_SOURCES.design_creative || []));
      }
      if (this.matches(roleAndSkills, ['market', 'seo', 'sales', 'growth'])) {
          sources.push(...(list.marketing_sales || FALLBACK_SOURCES.marketing_sales || []));
      }
      
      // Mescola e rimuovi duplicati
      return [...new Set(sources)].sort(() => 0.5 - Math.random());
  }

  private matches(text: string, keywords: string[]): boolean {
      return keywords.some(k => text.includes(k));
  }

  // ==================================================================================
  // 💾 SALVATAGGIO & VALIDAZIONE
  // ==================================================================================
  private async processAndSaveOpportunities(rawJson: string, userId: string, type: 'daily' | 'weekly' | 'monthly') {
    try {
      // Pulizia JSON aggressiva
      let cleanContent = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      const firstBracket = cleanContent.indexOf('[');
      const lastBracket = cleanContent.lastIndexOf(']');
      
      if (firstBracket === -1 || lastBracket === -1) {
          console.warn("⚠️ Nessun JSON valido trovato nella risposta.");
          return;
      }
      
      const jsonStr = cleanContent.substring(firstBracket, lastBracket + 1);
      let missions = [];
      
      try {
          missions = JSON.parse(jsonStr);
      } catch (e) {
          console.error("⚠️ Errore di sintassi nel JSON restituito dall'AI.");
          return;
      }

      if (missions.length === 0) {
          console.warn("⚠️ 0 missioni trovate. I filtri Anti-Zombie potrebbero aver scartato tutto.");
          return;
      }

      let savedCount = 0;
      let maxCommands = type === 'weekly' ? 100 : (type === 'monthly' ? 400 : 20);

      for (const m of missions) {
        const finalUrl = m.source_url || m.url || "#";
        
        // 1. VALIDAZIONE URL
        if (!this.isValidJobUrl(finalUrl)) {
            // console.log(`URL Scartato (Link non valido): ${finalUrl}`);
            continue; 
        }

        // 2. PARSING PREZZO
        let reward = this.parseReward(m.payout_estimation || m.budget || m.reward);
        if (reward <= 0) reward = 10;

        // 3. CONTROLLO DUPLICATI
        const exists = await db.selectFrom('missions').select('id').where('source_url', '=', finalUrl).executeTakeFirst();

        if (!exists) {
            await db.insertInto('missions')
              .values({
                user_id: userId,
                title: m.title || "Opportunità",
                description: m.description || "Vedi dettagli nel link.",
                source_url: finalUrl,
                source: this.detectPlatform(finalUrl),
                reward_amount: reward,
                estimated_duration_hours: m.hours || (type === 'weekly' ? 10 : 2),
                status: 'pending',
                type: type,
                max_commands: maxCommands,
                conversation_history: JSON.stringify([]),
                platform: this.detectPlatform(finalUrl),
                company_name: m.company_name || "Confidenziale",
                match_score: m.match_score || 85,
                raw_data: JSON.stringify({ tasks_breakdown: m.tasks_breakdown || [] }),
                analysis_notes: m.analysis_notes || `Verificato: ${new Date().toLocaleDateString()}`
              })
              .execute();
            savedCount++;
        }
      }
      console.log(`✅ Salvataggio completato: ${savedCount} nuove missioni valide aggiunte.`);

    } catch (e) {
      console.error("❌ Errore Processamento:", e);
    }
  }

  // --- UTILS ---

  private isValidJobUrl(url: string): boolean {
      if (!url || url.length < 10 || url === "#") return false;
      if (!url.startsWith('http')) return false;
      
      // Filtra pagine di ricerca generiche (spesso usate come placeholder dall'AI)
      const badPatterns = ['/search', 'jobs?q=', 'login', 'signup', 'forgot-password'];
      if (badPatterns.some(p => url.includes(p))) return false;
      
      return true;
  }

  private detectPlatform(url: string): string {
      try {
          const hostname = new URL(url).hostname;
          return hostname.replace('www.', '').split('.')[0];
      } catch (e) { return 'Web'; }
  }

  private parseReward(rewardString: string | number): number {
    if (typeof rewardString === 'number') return rewardString;
    if (!rewardString) return 10;
    
    // Gestione range "$50-$100" -> media
    if (typeof rewardString === 'string' && rewardString.includes('-')) {
        const parts = rewardString.split('-');
        const n1 = parseFloat(parts[0].replace(/[^0-9.]/g, ''));
        const n2 = parseFloat(parts[1].replace(/[^0-9.]/g, ''));
        if (!isNaN(n1) && !isNaN(n2)) return Math.floor((n1 + n2) / 2);
    }

    const clean = rewardString.toString().replace(/[^0-9.]/g, '');
    return parseFloat(clean) || 10;
  }
}