import axios from 'axios';
import { db } from '../infra/db';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export class PerplexityService {
  private kbPath: string;

  constructor() {
    const isProd = process.env.NODE_ENV === 'production';
    this.kbPath = isProd 
      ? path.join(process.cwd(), 'dist', 'knowledge_base')
      : path.join(process.cwd(), 'src', 'knowledge_base');
  }

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
    } catch (e) { return ""; }
  }

  // --- GENERAZIONE PROTOCOLLO DI RICERCA ---
  private generateUserProtocol(profile: any): string {
    if (!profile || !profile.dreamRole) return `TARGET: Remote Jobs`;

    const aiData = profile.generatedSearchLogic || {};
    
    // Uniamo le keyword positive
    const posKeywords = Array.isArray(aiData.positive_keywords) && aiData.positive_keywords.length > 0
        ? aiData.positive_keywords.join(" OR ") // Usa OR per ampliare la ricerca
        : (profile.whatToDo || profile.dreamRole);

    // Uniamo le keyword negative
    const negKeywords = Array.isArray(aiData.negative_keywords) && aiData.negative_keywords.length > 0
        ? aiData.negative_keywords.join(", ") 
        : "Scams, MLM, Unpaid";

    return `
    === USER AVATAR ===
    ROLE: "${profile.dreamRole}"
    QUERY BOOLEAN LOGIC: (${posKeywords}) 
    STRICTLY EXCLUDE: ${negKeywords}
    USER NOTES: "${profile.advancedInstructions || "No extra rules"}"
    `;
  }

  public async findGrowthOpportunities(userId: string, clientProfile: any, mode: 'daily' | 'weekly' | 'monthly' = 'daily'): Promise<number> {
    console.log(`\n🚀 [PERPLEXITY] Avvio Caccia ${mode.toUpperCase()} per User: ${userId}`);
    const userProtocol = this.generateUserProtocol(clientProfile);
    
    // Mapping corretto della "recency" per Perplexity
    let recency = 'day'; 
    if (mode === 'weekly') recency = 'week';
    if (mode === 'monthly') recency = 'month';

    return await this.performSearch(userId, userProtocol, mode, recency);
  }

  private async performSearch(userId: string, protocol: string, mode: string, recency: string): Promise<number> {
    
    // 1. Carica il Prompt "Cacciatore" specifico
    let systemInstructionFile = 'system_headhunter_prompt.md';
    if (mode === 'weekly') systemInstructionFile = 'system_headhunter_weekly.md';
    if (mode === 'monthly') systemInstructionFile = 'system_headhunter_monthly.md';
    
    let systemBehavior = this.loadTextFile(systemInstructionFile);
    if (!systemBehavior) systemBehavior = "You are an expert headhunter finding verified remote jobs.";

    // 2. Carica le Fonti (o usa Fallback Premium)
    const sourcesJson = this.loadTextFile('sources_masterlist.json');
    let validSources = `
      - WeWorkRemotely
      - RemoteOK
      - LinkedIn Jobs (Filter: Remote)
      - Wellfound (AngelList)
      - WorkingNomads
      - Y Combinator Jobs
    `; // Fallback robusto

    try {
        const sourcesObj = JSON.parse(sourcesJson);
        if (sourcesObj.global_remote_platforms) {
            // Prende i primi 15 siti globali
            validSources = sourcesObj.global_remote_platforms.map((s:any) => s.name).slice(0, 15).join("\n- ");
        }
    } catch(e) {}

    // 3. Costruzione Query
    const searchContext = `
      ${protocol}

      --- 🔎 SEARCH PARAMETERS ---
      TIMEFRAME: Posted in the last ${recency.toUpperCase()}.
      LOCATION: Remote (Global/Europe/US).
      
      📍 PRIORITY SOURCES:
      ${validSources}

      🎯 MISSION:
      Find 5 HIGH-QUALITY active job listings.
      
      ⚠️ EXECUTION RULES:
      1. **NO 0€ JOBS:** If salary is hidden, YOU MUST ESTIMATE IT based on market rates (e.g. "$60k/yr (Est)"). Do not put 0.
      2. **NO GENERIC AGENCIES:** Filter out low-quality staffing agencies (Manpower, Adecco) unless it's a specific high-tech role.
      3. **VALID LINKS ONLY:** Must be a direct application link.

      OUTPUT FORMAT (JSON ARRAY):
      [{ "title": "...", "company_name": "...", "platform": "...", "hourly_rate": "50", "difficulty": "Medium", "action_link": "URL", "why_it_works": "..." }]
    `;

    console.log(`🔍 [QUERY] Richiesta a Perplexity...`);
    
    try {
      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'sonar-pro', 
          messages: [
            { role: 'system', content: systemBehavior },
            { role: 'user', content: searchContext }
          ],
          temperature: 0.2, // Bassa creatività per evitare allucinazioni
          max_tokens: 4000
        },
        { headers: { 'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}` } }
      );

      const rawContent = response.data.choices[0].message.content;
      return await this.processAndSaveOpportunities(rawContent, userId, mode as any);

    } catch (error: any) {
      console.error("❌ Errore API Perplexity:", error.message);
      return 0;
    }
  }

  private async processAndSaveOpportunities(rawContent: string, userId: string, type: 'daily' | 'weekly' | 'monthly'): Promise<number> {
    let opportunities = [];
    try {
      // Pulizia aggressiva JSON
      let cleanJson = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
      const arrayMatch = cleanJson.match(/\[.*\]/s);
      if (arrayMatch) cleanJson = arrayMatch[0];
      
      opportunities = JSON.parse(cleanJson);
    } catch (e) {
      console.error("⚠️ JSON Parsing Error. Raw content non valido.");
      return 0;
    }

    if (!Array.isArray(opportunities)) return 0;

    let savedCount = 0;
    for (const opp of opportunities) {
      // Filtro base link spazzatura
      if (!opp.action_link || opp.action_link.length < 5 || opp.action_link.includes("manpower.it")) continue;

      const existing = await db.selectFrom('missions')
        .select('id')
        .where('user_id', '=', userId)
        .where('source_url', '=', opp.action_link)
        .executeTakeFirst();

      if (!existing) {
        // Parsing prezzo migliorato
        let finalReward = this.parseReward(opp.hourly_rate || opp.reward);
        if (finalReward === 0) finalReward = 25; // Default di sicurezza visivo (mai 0)

        await db.insertInto('missions')
          .values({
            id: crypto.randomUUID(),
            user_id: userId,
            title: opp.title,
            company_name: opp.company_name || opp.platform || "N/A",
            description: `${opp.why_it_works || ''}\n\nRequisiti: ${opp.difficulty || 'N/A'}`,
            source_url: opp.action_link,
            reward_amount: finalReward,
            estimated_duration_hours: 1, 
            status: 'pending',
            type: type,
            platform: "AI Hunter",
            match_score: 100,
            created_at: new Date().toISOString() as any,
            raw_data: JSON.stringify(opp)
          })
          .execute();
        savedCount++;
      }
    }
    console.log(`✅ Salvate ${savedCount} nuove missioni.`);
    return savedCount;
  }

  // --- PARSER PREZZI INTELLIGENTE ---
  private parseReward(rewardStr: string): number {
    if (!rewardStr) return 0;
    
    // Normalizza
    const str = rewardStr.toString().toLowerCase().replace(/,/g, '').replace(/\./g, ''); 
    
    // 1. Gestione Annuale ("80k/yr", "100,000")
    if (str.includes('k') || str.includes('yr') || str.includes('year')) {
        const matches = str.match(/(\d+)/);
        if (matches) {
            let val = parseInt(matches[0], 10);
            if (val < 1000) val *= 1000; // se è "80", diventa "80000"
            return Math.floor(val / 2000); // Annuale -> Orario (circa)
        }
    }

    // 2. Gestione Oraria standard ("50", "$50/hr")
    const matches = str.match(/(\d+)/);
    return matches ? parseInt(matches[0], 10) : 0;
  }
}