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

  private generateUserProtocol(profile: any): string {
    if (!profile || !profile.dreamRole) return `TARGET: Remote Jobs`;

    const aiData = profile.generatedSearchLogic || {};
    
    const posKeywords = Array.isArray(aiData.positive_keywords) && aiData.positive_keywords.length > 0
        ? aiData.positive_keywords.join(", ") 
        : (profile.whatToDo || profile.dreamRole);

    const negKeywords = Array.isArray(aiData.negative_keywords) && aiData.negative_keywords.length > 0
        ? aiData.negative_keywords.join(", ") 
        : (profile.whatToAvoid || "Scams");

    return `
    === USER TARGET ===
    ROLE: "${profile.dreamRole}"
    MUST INCLUDE: ${posKeywords}
    MUST EXCLUDE: ${negKeywords}
    USER NOTES: "${profile.advancedInstructions || "No extra rules"}"
    `;
  }

  public async findGrowthOpportunities(userId: string, clientProfile: any, mode: 'daily' | 'weekly' | 'monthly' = 'daily'): Promise<number> {
    console.log(`\n🚀 [PERPLEXITY] Avvio Caccia ${mode.toUpperCase()} per User: ${userId}`);
    const userProtocol = this.generateUserProtocol(clientProfile);
    let recency = mode === 'weekly' ? 'week' : (mode === 'monthly' ? 'month' : 'day');
    return await this.performSearch(userId, userProtocol, mode, recency);
  }

  private async performSearch(userId: string, protocol: string, mode: string, recency: string): Promise<number> {
    
    let systemInstructionFile = 'system_headhunter_prompt.md';
    if (mode === 'weekly') systemInstructionFile = 'system_headhunter_weekly.md';
    if (mode === 'monthly') systemInstructionFile = 'system_headhunter_monthly.md';
    
    let systemBehavior = this.loadTextFile(systemInstructionFile);
    if (!systemBehavior) systemBehavior = "You are an expert headhunter.";

    // --- FIX QUALITÀ: FONTI PREMIUM ---
    // Invece di affidarci solo al file, forziamo le fonti migliori direttamente qui
    const premiumSources = `
      1. WeWorkRemotely (Tech & Marketing)
      2. RemoteOK (Global Remote)
      3. LinkedIn Jobs (Filter: Remote, Last 24h)
      4. Otta.com (High quality tech)
      5. Wellfound (Startups)
      6. Upwork (Enterprise Clients Only)
      7. WorkingNomads
    `;

    const searchContext = `
      ${protocol}

      --- 🛡️ SEARCH PARAMETERS ---
      TIMEFRAME: Opportunities posted in the last ${recency === 'day' ? '24 HOURS' : '7 DAYS'}.
      LOCATION: Remote (Worldwide or Europe/US based).
      
      📍 PRIORITY SOURCES (Ignore local staffing agencies like Manpower/Adecco):
      ${premiumSources}

      🎯 GOAL: Find 5 HIGH-PAYING, concrete job listings.
      
      ⚠️ CRITICAL RULES:
      1. **NO 0€ JOBS**: If salary is not listed, ESTIMATE it based on market rates for the role (e.g., "Estimate: $40/hr"). Do not return 0 or "Negotiable".
      2. **NO GENERIC AGENCIES**: Exclude listings from "Manpower", "Randstad", "Adecco" unless it's a specific high-level role.
      3. **LINK CHECK**: Must be a direct application link.

      OUTPUT FORMAT (JSON Array):
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
          temperature: 0.2, 
          max_tokens: 4000
        },
        { headers: { 'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}` } }
      );

      const rawContent = response.data.choices[0].message.content;
      return await this.processAndSaveOpportunities(rawContent, userId, mode as any);

    } catch (error: any) {
      console.error("❌ Errore API:", error.message);
      return 0;
    }
  }

  private async processAndSaveOpportunities(rawContent: string, userId: string, type: 'daily' | 'weekly' | 'monthly'): Promise<number> {
    let opportunities = [];
    try {
      let cleanJson = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
      const arrayMatch = cleanJson.match(/\[.*\]/s);
      if (arrayMatch) cleanJson = arrayMatch[0];
      opportunities = JSON.parse(cleanJson);
    } catch (e) {
      console.error("⚠️ JSON Parsing Error.");
      return 0;
    }

    if (!Array.isArray(opportunities)) return 0;

    let savedCount = 0;
    for (const opp of opportunities) {
      // Filtro link spazzatura
      if (!opp.action_link || opp.action_link.length < 5 || opp.action_link.includes("manpower.it")) continue;

      const existing = await db.selectFrom('missions')
        .select('id')
        .where('user_id', '=', userId)
        .where('source_url', '=', opp.action_link)
        .executeTakeFirst();

      if (!existing) {
        // --- FIX PREZZO: Logica migliorata ---
        let finalReward = this.parseReward(opp.hourly_rate || opp.reward);
        // Se ritorna 0, proviamo a stimare un default basato sul tipo di lavoro (es. 20€/h) per non mostrare 0
        if (finalReward === 0) finalReward = 20; 

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

  // --- FIX PARSER PREZZI AVANZATO ---
  private parseReward(rewardStr: string): number {
    if (!rewardStr) return 0;
    
    const str = rewardStr.toLowerCase().replace(/,/g, ''); // Rimuove virgole (es. 1,000 -> 1000)
    
    // 1. Cerca pattern annuali (es. "50k/yr", "60000 a year")
    if (str.includes('yr') || str.includes('year') || str.includes('annum')) {
        const matches = str.match(/(\d+)(k?)/);
        if (matches) {
            let val = parseFloat(matches[1]);
            if (matches[2] === 'k') val *= 1000; // Gestisce "50k"
            return Math.floor(val / 2000); // Converte annuale in orario (circa 2000 ore lavorative)
        }
    }

    // 2. Cerca pattern mensili
    if (str.includes('mo') || str.includes('month')) {
        const matches = str.match(/(\d+)(k?)/);
        if (matches) {
            let val = parseFloat(matches[1]);
            if (matches[2] === 'k') val *= 1000;
            return Math.floor(val / 160); // Converte mensile in orario
        }
    }

    // 3. Fallback: Cerca il numero più alto nella stringa (spesso è il max del range "15-20")
    // Se c'è "k" (es. 2k), moltiplica.
    const numbers = str.match(/(\d+)(\.\d+)?(k?)/g);
    if (numbers) {
        // Prende il primo match sensato
        let valStr = numbers[0]; 
        let multiplier = 1;
        if (valStr.includes('k')) {
            multiplier = 1000;
            valStr = valStr.replace('k', '');
        }
        return Math.floor(parseFloat(valStr) * multiplier);
    }

    return 0;
  }
}