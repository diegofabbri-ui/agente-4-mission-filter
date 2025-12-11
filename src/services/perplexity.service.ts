import axios from 'axios';
import { db } from '../infra/db';
import fs from 'fs';
import path from 'path';

// --- CONFIGURAZIONE ROBUSTA MASTERLIST ---
// Definiamo un fallback hardcoded nel caso il file JSON non si carichi correttamente
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
    console.warn("⚠️ Warning: sources_masterlist.json non trovato o invalido. Uso Fallback di emergenza.");
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
  // 🔍 CORE: RICERCA OPPORTUNITÀ (Logica "Wide Net" per evitare 0 risultati)
  // ==================================================================================
  public async findGrowthOpportunities(userId: string, clientProfile: any, mode: 'daily' | 'weekly' | 'monthly' = 'daily') {
    
    console.log(`🚀 [HUNTER] Avvio caccia ${mode.toUpperCase()} per User: ${userId}`);

    // 1. Prompt di Base (Caricamento o Default)
    let systemInstruction = "";
    if (mode === 'weekly') systemInstruction = this.loadTextFile('system_headhunter_weekly.md');
    else if (mode === 'monthly') systemInstruction = this.loadTextFile('system_headhunter_monthly.md');
    else systemInstruction = this.loadTextFile('system_headhunter_prompt.md');

    if (!systemInstruction || systemInstruction.length < 10) {
        systemInstruction = "You are a headhunter. Find 5 active freelance jobs matching the user profile. Return strictly JSON.";
    }

    // 2. Selezione Fonti (Limitata per non rompere la query)
    const userRole = (clientProfile.dreamRole || "freelancer").toLowerCase();
    const userSkills = (clientProfile.keySkillsToAcquire || []).join(' ').toLowerCase();
    
    // Prendiamo max 10 siti mirati + aggregatori
    const targetSites = this.getRelevantSources(userRole + " " + userSkills).slice(0, 10);
    
    // 3. Definizione Tempo (Natural Language è più affidabile degli operatori stretti)
    const timeFrame = mode === 'daily' ? 'last 24 hours' : (mode === 'weekly' ? 'past 3 days' : 'past week');
    
    // 4. COSTRUZIONE QUERY "WIDE NET"
    // Invece di usare operatori booleani stretti che l'API può rifiutare, usiamo istruzioni discorsive chiare.
    const searchContext = `
      TARGET ROLE: ${clientProfile.dreamRole}
      SKILLS: ${(clientProfile.keySkillsToAcquire || []).join(', ')}

      SEARCH INSTRUCTIONS:
      1. Search specifically on these platforms: ${targetSites.join(', ')}.
      2. ALSO search major aggregators like Google Jobs, LinkedIn, Upwork.
      3. **CRITICAL:** Look ONLY for jobs posted in the **${timeFrame}**.
      4. IGNORE expired jobs, closed listings, or generic "search" pages.
    `;

    try {
      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'sonar-pro', // Modello migliore per ricerca web
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: `${searchContext}\n\nTASK: Find 5 REAL, ACTIVE job listings matching the '${mode}' timeframe.\n\nOUTPUT RULES:\n- Return ONLY a valid JSON Array.\n- Ensure 'source_url' is a deep link (not a search page).\n- If payout is hidden, estimate it based on market rates.` }
          ],
          temperature: 0.2 // Leggermente più creativo per trovare risultati se quelli stretti mancano
        },
        { headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' } }
      );

      const rawContent = response.data.choices[0].message.content;
      console.log(`📡 Risposta Perplexity ricevuta (${rawContent.length} chars). Elaborazione...`);
      
      await this.processAndSaveOpportunities(rawContent, userId, mode);

    } catch (error: any) {
      console.error("❌ Errore Critico Perplexity API:", error.response?.data || error.message);
    }
  }

  // ==================================================================================
  // 🧠 INTELLIGENZA FONTI (Con Fallback)
  // ==================================================================================
  private getRelevantSources(roleAndSkills: string): string[] {
      // Se la masterlist è vuota (errore caricamento), usa i fallback
      const list = Object.keys(sourcesMasterlist).length > 0 ? sourcesMasterlist : FALLBACK_SOURCES;
      
      // Fallback sicuro per accedere alle proprietà
      const aggregators = list.aggregators || FALLBACK_SOURCES.aggregators || [];
      const general = list.general_remote || FALLBACK_SOURCES.general_remote || [];

      let sources = [...aggregators, ...general];

      // Matching semantico semplice
      if (this.matches(roleAndSkills, ['dev', 'code', 'react', 'node', 'fullstack', 'engineer'])) sources.push(...(list.tech_dev || FALLBACK_SOURCES.tech_dev || []));
      if (this.matches(roleAndSkills, ['writ', 'content', 'copy', 'blog'])) sources.push(...(list.writing_content || []));
      if (this.matches(roleAndSkills, ['design', 'ui', 'ux', 'art'])) sources.push(...(list.design_creative || []));
      if (this.matches(roleAndSkills, ['market', 'seo', 'sales'])) sources.push(...(list.marketing_sales || []));
      // Gestione sicura per categorie opzionali
      if (this.matches(roleAndSkills, ['crypto', 'web3', 'defi']) && list.crypto_web3) sources.push(...list.crypto_web3);

      // Rimuovi duplicati e mescola
      return [...new Set(sources)].sort(() => 0.5 - Math.random());
  }

  private matches(text: string, keywords: string[]): boolean {
      return keywords.some(k => text.includes(k));
  }

  // ==================================================================================
  // 💾 SALVATAGGIO (Robustezza ++)
  // ==================================================================================
  private async processAndSaveOpportunities(rawJson: string, userId: string, type: 'daily' | 'weekly' | 'monthly') {
    try {
      // Pulizia aggressiva del JSON (rimuove backticks, testo prima/dopo)
      const firstBracket = rawJson.indexOf('[');
      const lastBracket = rawJson.lastIndexOf(']');
      
      if (firstBracket === -1 || lastBracket === -1) {
          console.warn("⚠️ Nessun array JSON trovato nella risposta. Raw:", rawJson.substring(0, 100));
          return;
      }
      
      const cleanJson = rawJson.substring(firstBracket, lastBracket + 1);
      let missions = [];
      
      try {
          missions = JSON.parse(cleanJson);
      } catch (e) {
          console.error("⚠️ JSON Parse Error. L'AI ha restituito JSON malformato.");
          return;
      }

      if (missions.length === 0) {
          console.warn("⚠️ L'AI ha restituito una lista vuota (0 missioni trovate).");
          return;
      }

      let savedCount = 0;
      let maxCommands = type === 'weekly' ? 100 : (type === 'monthly' ? 400 : 20);

      for (const m of missions) {
        const finalUrl = m.source_url || m.url || "#";
        
        // Validazione URL meno aggressiva (per evitare falsi negativi che causano 0 risultati)
        if (!this.isValidJobUrl(finalUrl)) {
            // console.log(`Skipped URL: ${finalUrl}`);
            continue; 
        }

        const exists = await db.selectFrom('missions').select('id').where('source_url', '=', finalUrl).executeTakeFirst();

        if (!exists) {
            await db.insertInto('missions')
              .values({
                user_id: userId,
                title: m.title || "Opportunità",
                description: m.description || "Dettagli non disponibili.",
                source_url: finalUrl,
                source: this.detectPlatform(finalUrl),
                reward_amount: this.parseReward(m.payout_estimation || m.budget || m.reward),
                estimated_duration_hours: m.hours || (type === 'weekly' ? 10 : 2),
                status: 'pending',
                type: type,
                max_commands: maxCommands,
                conversation_history: JSON.stringify([]),
                platform: this.detectPlatform(finalUrl),
                company_name: m.company_name || "Confidenziale",
                match_score: m.match_score || 80,
                raw_data: JSON.stringify({ tasks_breakdown: m.tasks_breakdown || [] }),
                analysis_notes: m.analysis_notes || "Analisi automatica."
              })
              .execute();
            savedCount++;
        }
      }
      console.log(`✅ Salvataggio completato: ${savedCount} nuove missioni aggiunte.`);

    } catch (e) {
      console.error("❌ Errore Processamento:", e);
    }
  }

  // --- UTILS ---

  private isValidJobUrl(url: string): boolean {
      if (!url || url.length < 8 || url === "#") return false;
      if (!url.startsWith('http')) return false;
      // Filtra solo le pagine di ricerca palesi, ma accetta tutto il resto per massimizzare i risultati
      if (url.includes('/search') || url.includes('?q=')) return false; 
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
    if (!rewardString) return 10; // Valore di default se manca
    
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