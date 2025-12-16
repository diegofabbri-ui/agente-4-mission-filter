import axios from 'axios';
import { db } from '../infra/db';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export class PerplexityService {
  private kbPath: string;

  constructor() {
    const isProd = process.env.NODE_ENV === 'production';
    // Gestione dinamica per trovare la cartella knowledge_base in dev e prod
    this.kbPath = isProd 
      ? path.join(process.cwd(), 'dist', 'knowledge_base')
      : path.join(process.cwd(), 'src', 'knowledge_base');
  }

  /**
   * Carica i file di testo (prompt o json) dalla Knowledge Base
   */
  private loadTextFile(filename: string): string {
    try {
      const possiblePaths = [
        path.join(this.kbPath, filename),
        path.join(this.kbPath, 'developer', filename),
        path.join(process.cwd(), 'src', 'knowledge_base', filename)
      ];

      for (const p of possiblePaths) {
        if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8');
      }
      return "";
    } catch (e) {
      console.error(`Errore lettura file ${filename}:`, e);
      return "";
    }
  }

  /**
   * Genera il Protocollo di Ricerca usando le Keyword AI salvate nel DB
   */
  private generateUserProtocol(profile: any): string {
    if (!profile || !profile.dreamRole) {
        return `TARGET: Remote Jobs\nCONTEXT: General search.`;
    }

    // 1. Recupero Keyword generate da GPT (se presenti)
    const aiData = profile.generatedSearchLogic || {};
    
    // Uniamo le keyword in stringhe per il prompt
    const posKeywords = Array.isArray(aiData.positive_keywords) && aiData.positive_keywords.length > 0
        ? aiData.positive_keywords.join(", ") 
        : (profile.whatToDo || profile.dreamRole); // Fallback

    const negKeywords = Array.isArray(aiData.negative_keywords) && aiData.negative_keywords.length > 0
        ? aiData.negative_keywords.join(", ") 
        : (profile.whatToAvoid || "Scams"); // Fallback

    const extraRules = profile.advancedInstructions || "No extra rules.";

    // 2. Costruzione Prompt
    return `
    === USER TARGET PROFILE ===
    1. 🎯 ROLE: "${profile.dreamRole}"
    
    2. 🔍 SEARCH KEYWORDS (AI OPTIMIZED):
       ✅ INCLUDE: ${posKeywords}
       ❌ EXCLUDE: ${negKeywords}

    3. 📝 SPECIAL USER RULES:
       "${extraRules}"
    `;
  }

  /**
   * Entry Point: Avvia la ricerca (Daily/Weekly/Monthly)
   */
  public async findGrowthOpportunities(userId: string, clientProfile: any, mode: 'daily' | 'weekly' | 'monthly' = 'daily'): Promise<number> {
    console.log(`\n🚀 [PERPLEXITY] Avvio Caccia ${mode.toUpperCase()} per User: ${userId}`);

    const userProtocol = this.generateUserProtocol(clientProfile);

    // Definizione orizzonte temporale
    let recency = 'day';
    if (mode === 'weekly') recency = 'week';
    if (mode === 'monthly') recency = 'month';

    return await this.performSearch(userId, userProtocol, mode, recency);
  }

  /**
   * Esegue la chiamata API a Perplexity
   */
  private async performSearch(userId: string, protocol: string, mode: string, recency: string): Promise<number> {
    
    // 1. Carica il Prompt di Sistema (Identità Headhunter)
    let systemInstructionFile = 'system_headhunter_prompt.md'; // Default Daily
    if (mode === 'weekly') systemInstructionFile = 'system_headhunter_weekly.md';
    if (mode === 'monthly') systemInstructionFile = 'system_headhunter_monthly.md';
    
    let systemBehavior = this.loadTextFile(systemInstructionFile);
    if (!systemBehavior) systemBehavior = "You are an expert headhunter finding verified remote jobs.";

    // 2. Carica le Fonti (Grounding)
    const sourcesJson = this.loadTextFile('sources_masterlist.json');
    let validSources = "";
    try {
        const sourcesObj = JSON.parse(sourcesJson);
        // Prendi i primi 20 siti globali per dare un contesto forte
        if (sourcesObj.global_remote_platforms) {
            validSources = sourcesObj.global_remote_platforms
                .map((s: any) => s.url || s.name)
                .slice(0, 20)
                .join(", ");
        }
    } catch(e) { 
        console.warn("⚠️ sources_masterlist.json non caricato o invalido."); 
    }

    // 3. Costruisci il Contesto di Ricerca Finale
    const searchContext = `
      ${protocol}

      --- 🛡️ SEARCH CONFIGURATION ---
      TIMEFRAME: Opportunities from the last ${recency === 'day' ? '24 HOURS' : '7 DAYS'}.
      REGION: Remote (Global/Europe preferred).
      
      📍 PRIORITY SOURCES (Scan these first):
      ${validSources}

      🎯 GOAL: Find 5 active job listings.
      
      ⚠️ EXECUTION RULES:
      1. **Verify Links:** Ensure 'action_link' is not a placeholder.
      2. **Fallback Protocol:** If 0 exact matches are found, BROADEN the search to closely related roles or synonyms. Do not return an empty list unless absolutely necessary.
      3. **Anti-Scam:** Filter out "Commission Only" or "Unpaid".

      OUTPUT FORMAT:
      Return ONLY a raw JSON Array based on the schema defined in the System Prompt.
    `;

    console.log(`🔍 [QUERY] Richiesta a Perplexity (Sonar-Pro)...`);
    
    try {
      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'sonar-pro', 
          messages: [
            { role: 'system', content: systemBehavior },
            { role: 'user', content: searchContext }
          ],
          // Temperatura 0.2: Bassa per precisione, ma abbastanza "viva" per trovare sinonimi
          temperature: 0.2, 
          max_tokens: 4000
        },
        { headers: { 'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}` } }
      );

      const rawContent = response.data.choices[0].message.content;
      
      // LOG DEBUG: Utile per vedere cosa risponde l'AI se l'array risulta vuoto
      console.log("📝 [RAW RESPONSE START]", rawContent.substring(0, 150), "... [END]");

      return await this.processAndSaveOpportunities(rawContent, userId, mode as any);

    } catch (error: any) {
      console.error("❌ Errore API Perplexity:", error.response?.data || error.message);
      return 0;
    }
  }

  /**
   * Processa il JSON, pulisce i dati e salva nel DB
   */
  private async processAndSaveOpportunities(rawContent: string, userId: string, type: 'daily' | 'weekly' | 'monthly'): Promise<number> {
    let opportunities = [];
    
    try {
      // 1. Pulizia Avanzata del JSON
      // Rimuove markdown, spazi extra e cerca di estrarre solo la parte array [...]
      let cleanJson = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
      
      const arrayMatch = cleanJson.match(/\[.*\]/s); // Regex che cerca l'array JSON anche se c'è testo attorno
      if (arrayMatch) {
          cleanJson = arrayMatch[0];
      }

      opportunities = JSON.parse(cleanJson);
    } catch (e) {
      console.error("⚠️ Errore parsing JSON. Il contenuto raw potrebbe non essere valido.");
      return 0;
    }

    if (!Array.isArray(opportunities) || opportunities.length === 0) {
        console.warn("⚠️ Nessuna opportunità valida trovata (Array vuoto).");
        return 0;
    }

    let savedCount = 0;
    
    for (const opp of opportunities) {
      // 2. Filtro Validità Link di Base
      // Deve avere almeno 5 caratteri e contenere un punto (es. "a.com")
      if (!opp.action_link || opp.action_link.length < 5 || !opp.action_link.includes('.')) {
          continue;
      }

      // 3. Verifica Duplicati nel DB
      const existing = await db.selectFrom('missions')
        .select('id')
        .where('user_id', '=', userId)
        .where((eb) => eb.or([
          eb('source_url', '=', opp.action_link),
          eb.and([
            eb('title', '=', opp.title),
            eb('company_name', '=', opp.platform || opp.company_name)
          ])
        ]))
        .executeTakeFirst();

      if (!existing) {
        await db.insertInto('missions')
          .values({
            id: crypto.randomUUID(),
            user_id: userId,
            title: opp.title,
            company_name: opp.company_name || opp.platform || "N/A",
            description: `${opp.why_it_works || ''}\n\nRequisiti: ${opp.difficulty || 'N/A'}\n${opp.description || ''}`,
            source_url: opp.action_link,
            reward_amount: this.parseReward(opp.hourly_rate || opp.reward),
            estimated_duration_hours: 1, 
            status: 'pending',
            type: type,
            platform: "AI Hunter",
            match_score: 100,
            // --- FIX CRITICO: Conversione esplicita a stringa ISO per evitare l'errore TS2322 ---
            created_at: new Date().toISOString() as any,
            raw_data: JSON.stringify(opp)
          })
          .execute();
        savedCount++;
      }
    }

    console.log(`✅ Salvate ${savedCount} nuove missioni verificate.`);
    return savedCount;
  }

  // Helper per estrarre numeri da stringhe come "$50/hr" o "€2000"
  private parseReward(rewardStr: string): number {
    if (!rewardStr) return 0;
    // Cerca il primo numero intero nella stringa
    const matches = rewardStr.match(/\d+/);
    return matches ? parseInt(matches[0], 10) : 0;
  }
}