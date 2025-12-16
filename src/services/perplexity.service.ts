import axios from 'axios';
import { db } from '../infra/db';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export class PerplexityService {
  private kbPath: string;

  constructor() {
    const isProd = process.env.NODE_ENV === 'production';
    // Gestione dinamica del percorso per trovare i file sia in dev che in prod
    this.kbPath = isProd 
      ? path.join(process.cwd(), 'dist', 'knowledge_base')
      : path.join(process.cwd(), 'src', 'knowledge_base');
  }

  /**
   * Carica file di testo (prompt o json) dalla Knowledge Base.
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
   * --- GENERATORE PROTOCOLLO DI RICERCA ---
   * Trasforma le Keyword AI salvate nel DB in istruzioni per Perplexity.
   */
  private generateUserProtocol(profile: any): string {
    if (!profile || !profile.dreamRole) {
        return `TARGET: Remote Jobs\nCONTEXT: General search.`;
    }

    // 1. RECUPERO KEYWORD AI (Create da user.routes.ts)
    const aiData = profile.generatedSearchLogic || {};
    
    // Uniamo le keyword in stringhe per il prompt
    const posKeywords = Array.isArray(aiData.positive_keywords) && aiData.positive_keywords.length > 0
        ? aiData.positive_keywords.join(", ") 
        : (profile.whatToDo || profile.dreamRole); // Fallback

    const negKeywords = Array.isArray(aiData.negative_keywords) && aiData.negative_keywords.length > 0
        ? aiData.negative_keywords.join(", ") 
        : (profile.whatToAvoid || "Scams, MLM, Unpaid"); // Fallback

    const extraRules = profile.advancedInstructions || "No extra rules.";

    // 2. COSTRUZIONE PROMPT
    return `
    === USER TARGET PROFILE ===
    
    1. 🎯 ROLE: "${profile.dreamRole}"
    
    2. 🔍 SEARCH KEYWORDS (AI OPTIMIZED):
       ✅ INCLUDE: ${posKeywords}
       ❌ EXCLUDE: ${negKeywords}

    3. 📝 SPECIAL RULES:
       "${extraRules}"
    `;
  }

  /**
   * Entry Point: Avvia la ricerca.
   */
  public async findGrowthOpportunities(userId: string, clientProfile: any, mode: 'daily' | 'weekly' | 'monthly' = 'daily'): Promise<number> {
    console.log(`\n🚀 [PERPLEXITY] Avvio Caccia ${mode.toUpperCase()} per User: ${userId}`);

    const userProtocol = this.generateUserProtocol(clientProfile);

    let recency = 'day';
    if (mode === 'weekly') recency = 'week';
    if (mode === 'monthly') recency = 'month';

    return await this.performSearch(userId, userProtocol, mode, recency);
  }

  /**
   * Esegue la chiamata API a Perplexity.
   */
  private async performSearch(userId: string, protocol: string, mode: string, recency: string): Promise<number> {
    
    // 1. CARICA IL "CERVELLO" (Prompt di Sistema)
    let systemInstructionFile = 'system_headhunter_prompt.md'; // Default Daily
    if (mode === 'weekly') systemInstructionFile = 'system_headhunter_weekly.md';
    if (mode === 'monthly') systemInstructionFile = 'system_headhunter_monthly.md';
    
    let systemBehavior = this.loadTextFile(systemInstructionFile);
    if (!systemBehavior) systemBehavior = "You are an expert headhunter finding verified remote jobs.";

    // 2. CARICA LE FONTI (Grounding)
    // Questo è fondamentale per evitare allucinazioni: diamo all'AI una lista di siti reali.
    const sourcesJson = this.loadTextFile('sources_masterlist.json');
    let validSources = "";
    try {
        const sourcesObj = JSON.parse(sourcesJson);
        // Prendiamo i primi 20 siti globali per dare un contesto forte
        if (sourcesObj.global_remote_platforms) {
            validSources = sourcesObj.global_remote_platforms
                .map((s: any) => s.url || s.name)
                .slice(0, 20)
                .join(", ");
        }
    } catch(e) { 
        console.warn("⚠️ sources_masterlist.json non caricato o invalido."); 
    }

    // 3. COSTRUISCI IL MESSAGGIO FINALE
    const searchContext = `
      ${protocol}

      --- 🛡️ SEARCH PARAMETERS (ANTI-HALLUCINATION) ---
      TIMEFRAME: Opportunities published in the last ${recency === 'day' ? '24 HOURS' : '7 DAYS'}.
      LOCATION: Remote (Global/Europe preferred).
      
      📍 PRIORITY SOURCES (Scan these first):
      ${validSources}

      🎯 GOAL: Find UP TO 5 concrete, active job listings.
      
      ⚠️ STRICT RULES:
      1. If you find 0 jobs, return []. Do NOT invent jobs.
      2. Verify that 'action_link' is a valid URL.
      3. Exclude aggregators if a direct company link is available.

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
          temperature: 0.1, // Bassa temperatura = Massima precisione
          max_tokens: 4000
        },
        { headers: { 'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}` } }
      );

      const rawContent = response.data.choices[0].message.content;
      return await this.processAndSaveOpportunities(rawContent, userId, mode as any);

    } catch (error: any) {
      console.error("❌ Errore API Perplexity:", error.response?.data || error.message);
      return 0;
    }
  }

  /**
   * Processa il JSON, filtra i fake e salva nel DB.
   */
  private async processAndSaveOpportunities(rawContent: string, userId: string, type: 'daily' | 'weekly' | 'monthly'): Promise<number> {
    let opportunities = [];
    
    try {
      // Pulizia Markdown
      const jsonStr = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
      opportunities = JSON.parse(jsonStr);
    } catch (e) {
      console.error("⚠️ Errore parsing JSON da Perplexity.");
      return 0;
    }

    if (!Array.isArray(opportunities) || opportunities.length === 0) {
        console.warn("⚠️ Nessuna opportunità valida trovata (Risposta vuota).");
        return 0;
    }

    let savedCount = 0;
    
    for (const opp of opportunities) {
      // 4. FILTRO DI SICUREZZA LINK
      // Scarta link palesemente invalidi o placeholder
      if (!opp.action_link || opp.action_link.length < 10 || opp.action_link.includes("example.com")) {
          continue;
      }

      // Verifica duplicati nel DB
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
            description: `${opp.why_it_works || ''}\n\nRequisiti: ${opp.difficulty || 'N/A'}`,
            source_url: opp.action_link,
            reward_amount: this.parseReward(opp.hourly_rate || opp.reward),
            estimated_duration_hours: 1, 
            status: 'pending',
            type: type,
            platform: "AI Hunter",
            match_score: 100,
            // --- FIX DATE: Conversione esplicita a stringa ISO ---
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

  // Estrae numeri da stringhe come "$50/hr" o "€2000"
  private parseReward(rewardStr: string): number {
    if (!rewardStr) return 0;
    const matches = rewardStr.match(/\d+/);
    return matches ? parseInt(matches[0], 10) : 0;
  }
}