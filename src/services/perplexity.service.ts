import axios from 'axios';
import { db } from '../infra/db';
import fs from 'fs';
import path from 'path';

// Caricamento Masterlist Fonti (Tentativo doppio per dev/prod)
let sourcesMasterlist: any = {};
try {
    const pathsToTry = [
        path.join(process.cwd(), 'src', 'knowledge_base', 'sources_masterlist.json'),
        path.join(process.cwd(), 'dist', 'knowledge_base', 'sources_masterlist.json')
    ];
    
    for (const p of pathsToTry) {
        if (fs.existsSync(p)) {
            sourcesMasterlist = JSON.parse(fs.readFileSync(p, 'utf-8'));
            break;
        }
    }
} catch (e) {
    console.warn("⚠️ Warning: Impossibile caricare sources_masterlist.json");
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

  // Helper per caricare i prompt
  private loadTextFile(filename: string): string {
    try {
      const filePath = path.join(this.kbPath, filename);
      if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf-8');
      return "";
    } catch (e) { return ""; }
  }

  // ==================================================================================
  // 🔍 CORE: RICERCA OPPORTUNITÀ (DINAMICA & FRESCA)
  // ==================================================================================
  public async findGrowthOpportunities(userId: string, clientProfile: any, mode: 'daily' | 'weekly' | 'monthly' = 'daily') {
    
    console.log(`🚀 [HUNTER] Avvio caccia ${mode.toUpperCase()} (Smart Source Selection)`);

    // 1. CARICAMENTO MANUALE OPERATIVO (PROMPT)
    let systemInstruction = "";
    if (mode === 'weekly') systemInstruction = this.loadTextFile('system_headhunter_weekly.md');
    else if (mode === 'monthly') systemInstruction = this.loadTextFile('system_headhunter_monthly.md');
    else systemInstruction = this.loadTextFile('system_headhunter_prompt.md');

    if (!systemInstruction) systemInstruction = "Find active freelance jobs. Return strictly JSON.";

    // 2. TIME INJECTION (FILTRO ANTI-VECCHIUME)
    // Daily: Ultime 24h. Weekly: Ultimi 3gg. Monthly: Ultimi 7gg.
    const today = new Date();
    const pastDate = new Date();
    const lookbackDays = mode === 'daily' ? 1 : (mode === 'weekly' ? 3 : 7);
    pastDate.setDate(today.getDate() - lookbackDays);
    
    const dateStr = pastDate.toISOString().split('T')[0]; // Format: YYYY-MM-DD

    // 3. SELEZIONE INTELLIGENTE DELLE FONTI
    const userRole = (clientProfile.dreamRole || "").toLowerCase();
    const userSkills = (clientProfile.keySkillsToAcquire || []).join(' ').toLowerCase();
    const targetSites = this.getRelevantSources(userRole + " " + userSkills);
    
    // Costruiamo gli operatori "site:..." per Perplexity
    // Limitiamo a 15 siti per non confondere il modello con query troppo lunghe
    const siteOperators = targetSites.slice(0, 15).map(site => `site:${site}`).join(' OR ');

    // 4. COSTRUZIONE QUERY
    const searchContext = `
      TARGET PROFILE: ${clientProfile.dreamRole}
      KEY SKILLS: ${(clientProfile.keySkillsToAcquire || []).join(', ')}

      --- 🕒 TIME SENSITIVITY (CRITICAL) ---
      TODAY IS: ${today.toISOString().split('T')[0]}
      STRICT FILTER: Ignore any job posted BEFORE ${dateStr}.
      
      --- 🌐 TARGET SOURCES (DYNAMICALLY SELECTED) ---
      Searching on specialised niche sites + aggregators:
      QUERY OPERATORS: (${siteOperators})
    `;

    const userPrompt = `
      ${searchContext}
      
      TASK: Find 5 REAL, ACTIVE job listings matching the '${mode}' duration.
      
      MANDATORY RULES:
      1. **URL VALIDATION:** 'source_url' MUST be a direct link to the job post (NO search pages, NO aggregators like 'google jobs').
      2. **FRESHNESS:** Check the 'Posted' date. If it's older than ${lookbackDays} days, DISCARD IT.
      3. **FORMAT:** Return ONLY a valid JSON Array.
      
      OUTPUT JSON KEYS: title, company_name, source_url, platform, payout_estimation, tasks_breakdown, analysis_notes.
    `;

    try {
      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'sonar-pro', // Modello con capacità di ricerca web superiori
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1 // Massima determinazione, minima "fantasia"
        },
        { headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' } }
      );

      const rawContent = response.data.choices[0].message.content;
      await this.processAndSaveOpportunities(rawContent, userId, mode);

    } catch (error: any) {
      console.error("❌ Errore Perplexity API:", error.message);
    }
  }

  // ==================================================================================
  // 🧠 LOGICA SELEZIONE FONTI (Dalla Masterlist)
  // ==================================================================================
  private getRelevantSources(roleAndSkills: string): string[] {
      // 1. Base: Aggregatori + Generalisti (Sempre inclusi)
      let sources = [
          ...(sourcesMasterlist.aggregators || []),
          ...(sourcesMasterlist.general_remote || [])
      ];

      // 2. Iniezioni Verticali basate su Keyword
      if (this.matches(roleAndSkills, ['dev', 'engineer', 'software', 'react', 'node', 'python', 'web'])) {
          sources.push(...(sourcesMasterlist.tech_dev || []));
      }
      if (this.matches(roleAndSkills, ['write', 'copy', 'content', 'editor', 'blog', 'seo'])) {
          sources.push(...(sourcesMasterlist.writing_content || []));
      }
      if (this.matches(roleAndSkills, ['design', 'ui', 'ux', 'art', 'graphic', 'logo'])) {
          sources.push(...(sourcesMasterlist.design_creative || []));
      }
      if (this.matches(roleAndSkills, ['market', 'sales', 'growth', 'social media', 'ads'])) {
          sources.push(...(sourcesMasterlist.marketing_sales || []));
      }
      if (this.matches(roleAndSkills, ['crypto', 'web3', 'blockchain', 'defi', 'nft'])) {
          sources.push(...(sourcesMasterlist.crypto_web3 || []));
      }
      if (this.matches(roleAndSkills, ['ai', 'data', 'training', 'annotation', 'ml'])) {
          sources.push(...(sourcesMasterlist.ai_training || []));
      }

      // 3. Shuffle e Limit (Randomizza per non cercare sempre sugli stessi primi 5)
      return [...new Set(sources)].sort(() => 0.5 - Math.random());
  }

  private matches(text: string, keywords: string[]): boolean {
      return keywords.some(k => text.includes(k));
  }

  // ==================================================================================
  // 💾 SALVATAGGIO E VALIDAZIONE
  // ==================================================================================
  private async processAndSaveOpportunities(rawJson: string, userId: string, type: 'daily' | 'weekly' | 'monthly') {
    try {
      // Pulizia Markdown
      let cleanContent = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      const firstBracket = cleanContent.indexOf('[');
      const lastBracket = cleanContent.lastIndexOf(']');
      
      if (firstBracket === -1 || lastBracket === -1) {
          console.warn("⚠️ JSON non trovato nella risposta.");
          return;
      }
      
      const jsonStr = cleanContent.substring(firstBracket, lastBracket + 1);
      const missions = JSON.parse(jsonStr);
      
      let maxCommands = type === 'weekly' ? 100 : (type === 'monthly' ? 400 : 20);
      let savedCount = 0;

      for (const m of missions) {
        const finalUrl = m.source_url || m.url || "#";
        
        // --- FILTRO URL ---
        if (!this.isValidJobUrl(finalUrl)) {
            // console.log(`Scartato URL non valido: ${finalUrl}`);
            continue; 
        }

        // --- PARSING PREZZO ---
        let reward = this.parseReward(m.payout_estimation || m.budget || m.reward);
        if (reward <= 0) reward = 10; // Placeholder visivo

        // --- CONTROLLO DUPLICATI ---
        const exists = await db.selectFrom('missions').select('id').where('source_url', '=', finalUrl).executeTakeFirst();

        if (!exists) {
            await db.insertInto('missions')
              .values({
                user_id: userId,
                title: m.title || "Nuova Opportunità",
                description: m.description || "Vedi dettagli nel link.",
                source_url: finalUrl,
                source: this.detectPlatform(finalUrl),
                reward_amount: reward,
                estimated_duration_hours: m.hours || (type === 'weekly' ? 5 : 1),
                status: 'pending',
                type: type,
                max_commands: maxCommands,
                conversation_history: JSON.stringify([]),
                platform: this.detectPlatform(finalUrl),
                company_name: m.company_name || "Confidenziale",
                match_score: m.match_score || 85,
                raw_data: JSON.stringify({ tasks_breakdown: m.tasks_breakdown || [] }),
                analysis_notes: m.analysis_notes || `Caccia ${type} completata.`
              })
              .execute();
            savedCount++;
        }
      }
      console.log(`✅ Salvate ${savedCount} nuove missioni (${type}).`);

    } catch (e) {
      console.error("❌ Errore Parsing/Salvataggio:", e);
    }
  }

  // --- UTILS ---

  private isValidJobUrl(url: string): boolean {
      if (!url || url.length < 10 || url === "#") return false;
      if (!url.startsWith('http')) return false;

      // Filtra pattern di ricerca o login
      const badPatterns = ['/search', 'jobs?q=', 'login', 'signup', 'browse', '...'];
      if (badPatterns.some(p => url.includes(p))) return false;

      // Filtra URL troncati
      if (url.endsWith('.')) return false;

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
    if (!rewardString) return 0;
    
    // Gestione range "$50-$100" -> media
    if (typeof rewardString === 'string' && rewardString.includes('-')) {
        const parts = rewardString.split('-');
        const n1 = parseFloat(parts[0].replace(/[^0-9.]/g, ''));
        const n2 = parseFloat(parts[1].replace(/[^0-9.]/g, ''));
        if (!isNaN(n1) && !isNaN(n2)) return Math.floor((n1 + n2) / 2);
    }
    const clean = rewardString.replace(/[^0-9.]/g, '');
    return parseFloat(clean) || 0;
  }
}