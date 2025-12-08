import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { db } from '../infra/db';

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';
const MAX_DAILY_SEARCHES = 3;

// --- INTERFACCE DATI ---

export interface ClientCareerBlueprint {
  currentRole: string;
  dreamRole: string;
  keySkillsToAcquire: string[];
  interests: string[];
  antiVision: string[];
  unfairAdvantages: string[];
  minHourlyRate: number;
  riskTolerance: 'LOW' | 'HIGH'; 
  energyWindow: 'MORNING' | 'NIGHT' | 'WEEKEND';
}

// Struttura JSON "Ricca"
interface RichOpportunity {
  title: string;
  company_name: string;
  source_url: string;
  platform: string; 
  payout_estimation: string;
  remote_type: string;
  skills_required: string[];
  experience_level: string;
  match_score: number;
  analysis_notes: string;
}

// Interfaccia per gestire la quota
interface UserUsageStats {
  last_search_date: string; // YYYY-MM-DD
  daily_count: number;
}

export class PerplexityService {
  private apiKey: string;
  private kbPath: string;
  private sourcesMap: any;

  constructor() {
    this.apiKey = process.env.PERPLEXITY_API_KEY || '';
    const isProduction = process.env.NODE_ENV === 'production';
    this.kbPath = isProduction 
      ? path.join(process.cwd(), 'dist', 'knowledge_base')
      : path.join(process.cwd(), 'src', 'knowledge_base');

    if (!this.apiKey) console.warn('⚠️ ATTENZIONE: PERPLEXITY_API_KEY mancante.');
    this.sourcesMap = this.loadJsonFile('sources_masterlist.json') || {};
  }

  private loadTextFile(filename: string): string {
    try { return fs.readFileSync(path.join(this.kbPath, filename), 'utf-8'); } catch (e) { return ""; }
  }

  private loadJsonFile(filename: string): any {
    try { return JSON.parse(fs.readFileSync(path.join(this.kbPath, filename), 'utf-8')); } catch (e) { return null; }
  }

  // --- GESTIONE QUOTA (3/DAY) ---
  private async checkAndIncrementQuota(userId: string): Promise<boolean> {
    const today = new Date().toISOString().split('T')[0];
    const profile = await db.selectFrom('user_ai_profile').select(['weights', 'user_id']).where('user_id', '=', userId).executeTakeFirst();
    if (!profile) return false;

    let stats: UserUsageStats = { last_search_date: today, daily_count: 0 };
    let currentWeights: any = profile.weights || {};
    
    if (currentWeights._usage_stats) stats = currentWeights._usage_stats;

    if (stats.last_search_date !== today) {
      stats.last_search_date = today;
      stats.daily_count = 0;
    }

    if (stats.daily_count >= MAX_DAILY_SEARCHES) {
      console.warn(`⛔ [QUOTA] Utente ${userId} limite raggiunto.`);
      return false;
    }

    stats.daily_count++;
    currentWeights._usage_stats = stats;

    await db.updateTable('user_ai_profile')
      .set({ weights: JSON.stringify(currentWeights) })
      .where('user_id', '=', userId)
      .execute();

    console.log(`Hz [QUOTA] Ricerca ${stats.daily_count}/${MAX_DAILY_SEARCHES} ok.`);
    return true;
  }

  // --- SELEZIONE FONTI (INCLUDE GIG ECONOMY) ---
  private getTargetSites(interests: string[], dreamRole: string, currentRole: string = ""): string[] {
    // AGGIUNTA MANUALE PIATTAFORME GIG
    let sites: string[] = [
      ...(this.sourcesMap.aggregators || []),
      "upwork.com", "fiverr.com", "freelancer.com", "toptal.com", "peopleperhour.com"
    ];
    
    const context = (interests.join(' ') + ' ' + dreamRole + ' ' + currentRole).toLowerCase();

    if (context.includes('crypto') || context.includes('web3')) sites.push(...(this.sourcesMap.crypto_web3 || []));
    if (context.includes('writ') || context.includes('copy')) sites.push(...(this.sourcesMap.writing_content || []));
    if (context.includes('dev') || context.includes('tech')) sites.push(...(this.sourcesMap.tech_dev || []));
    if (context.includes('design') || context.includes('art')) sites.push(...(this.sourcesMap.design_creative || []));
    if (context.includes('marketing') || context.includes('sales')) sites.push(...(this.sourcesMap.marketing_sales || []));
    if (context.includes('ai') || context.includes('data')) sites.push(...(this.sourcesMap.ai_training || []));
    
    if (sites.length <= 15) {
      sites.push(...(this.sourcesMap.general_remote || []));
      sites.push(...(this.sourcesMap.async_remote || []));
    }

    return Array.from(new Set(sites)).slice(0, 35);
  }

  private async searchWeb(systemPrompt: string, userQuery: string): Promise<string> {
    console.log(`🌐 [HUNTER] Deep Search avviata...`);
    const now = new Date().toISOString();
    try {
      const response = await axios.post(
        PERPLEXITY_API_URL,
        {
          model: 'sonar-pro',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `${userQuery} \n\n(Context: Current Date/Time is ${now}. Find LIVE listings only.)` }
          ],
          temperature: 0.1,
          return_citations: true 
        },
        { headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' } }
      );
      return response.data.choices[0].message.content;
    } catch (error: any) {
      console.error('❌ Errore API Perplexity:', error.message);
      return '[]';
    }
  }

  public async findGrowthOpportunities(userId: string, clientProfile: ClientCareerBlueprint) {
    // 1. CONTROLLO QUOTA
    const canProceed = await this.checkAndIncrementQuota(userId);
    if (!canProceed) throw new Error(`Quota giornaliera raggiunta (${MAX_DAILY_SEARCHES} ricerche). Riprova domani.`);

    console.log(`🚀 [HUNTER] Caccia per: ${clientProfile.dreamRole}`);
    const targetSites = this.getTargetSites(clientProfile.interests, clientProfile.dreamRole, clientProfile.currentRole);
    const seoLogic = this.loadTextFile('dynamic_seo_logic.md');
    const systemInstruction = this.loadTextFile('system_headhunter_prompt.md');

    const systemPrompt = `
      ${systemInstruction}
      ---
      TARGET PROFILE: ${clientProfile.dreamRole}
      SKILLS: ${clientProfile.keySkillsToAcquire.join(', ')}
      MIN PAY: ${clientProfile.minHourlyRate} EUR/hr
      ---
      SEARCH STRATEGY:
      ${seoLogic}
      PRIORITY DOMAINS: ${targetSites.join(', ')}

      SPECIAL INSTRUCTION FOR GIG PLATFORMS (Upwork, Fiverr, etc.):
      Since direct listings might be behind a login wall, look for:
      1. Recent public aggregators indexing these gigs.
      2. "Client seeking freelancer" posts on Twitter/Reddit referencing these platforms.
      3. Publicly indexed profile requests matching the candidate's skills.
      OBJECTIVE: Find full-time contracts AND "Second Income" side hustles.
    `;

    const masterQuery = `Execute Deep Search for "${clientProfile.dreamRole}" jobs AND "Freelance/Side-Hustle" opportunities. Prioritize last 48h. Return ONLY valid JSON Array.`;

    const rawResult = await this.searchWeb(systemPrompt, masterQuery);
    await this.processAndSaveOpportunities(rawResult, userId);
  }

  private async processAndSaveOpportunities(rawJson: string, userId: string | null) {
    try {
      let cleanJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      const start = cleanJson.indexOf('['); const end = cleanJson.lastIndexOf(']');
      if (start !== -1 && end !== -1) cleanJson = cleanJson.substring(start, end + 1);
      
      let opportunities: RichOpportunity[] = JSON.parse(cleanJson);
      console.log(`💰 Trovate ${opportunities.length} opportunità.`);

      for (const opp of opportunities) {
        if (!opp.source_url || !opp.title) continue;
        const existing = await db.selectFrom('missions').select('id').where('source_url', '=', opp.source_url).executeTakeFirst();
        if (existing) continue;

        const reward = this.parseMoneySafe(opp.payout_estimation);
        await db.insertInto('missions').values({
            user_id: userId, 
            title: opp.title.substring(0, 255),
            description: opp.analysis_notes,
            source_url: opp.source_url,
            raw_category: opp.platform || 'Headhunter',
            reward_amount: reward,
            estimated_duration_hours: 1,
            status: 'pending',
            source: 'global_headhunter',
            company_name: opp.company_name,
            remote_type: opp.remote_type,
            skills_required: opp.skills_required,
            experience_level: opp.experience_level,
            match_score: opp.match_score,
            analysis_notes: opp.analysis_notes,
            platform: opp.platform, 
            raw_data: JSON.stringify(opp) 
          }).execute();
        console.log(`✅ [DB] Salvata: ${opp.title} (${opp.platform || 'Web'})`);
      }
    } catch (e) { console.error('❌ Errore salvataggio:', e); }
  }

  private parseMoneySafe(input: string): number {
    if (!input) return 0;
    const clean = input.toLowerCase().replace(/[^0-9.k]/g, ''); 
    let val = parseFloat(clean.replace('k', '')) || 0;
    if (clean.includes('k')) val *= 1000;
    if (input.toLowerCase().includes('year') || val > 15000) val = val / 2000;
    else if (input.toLowerCase().includes('month') || (val > 1000 && val <= 15000)) val = val / 160;
    if (val > 9999) return 9999;
    return parseFloat(val.toFixed(2));
  }
}