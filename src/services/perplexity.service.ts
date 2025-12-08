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

// Struttura JSON "Ricca" che chiediamo a Perplexity
interface RichOpportunity {
  title: string;
  company_name: string;
  source_url: string;
  platform: string; 
  payout_estimation: string; // Es. "€50/hr" o "€4000/mo"
  remote_type: string; // "Async", "Sync", "Hybrid"
  skills_required: string[];
  experience_level: string; // "Junior", "Mid", "Senior"
  match_score: number; // 0-100
  analysis_notes: string; // Spiegazione strategica
}

// Interfaccia per gestire la quota giornaliera nel campo JSON 'weights'
interface UserUsageStats {
  last_search_date: string; // YYYY-MM-DD
  daily_count: number;
}

export class PerplexityService {
  private apiKey: string;
  private kbPath: string;
  private sourcesMap: any; // Mappa delle 100+ fonti

  constructor() {
    this.apiKey = process.env.PERPLEXITY_API_KEY || '';
    
    // Gestione path per ambiente Dev (src) e Prod (dist)
    const isProduction = process.env.NODE_ENV === 'production';
    this.kbPath = isProduction 
      ? path.join(process.cwd(), 'dist', 'knowledge_base')
      : path.join(process.cwd(), 'src', 'knowledge_base');

    if (!this.apiKey) {
      console.warn('⚠️ ATTENZIONE: PERPLEXITY_API_KEY mancante.');
    }

    // Caricamento Mappa Fonti all'avvio
    this.sourcesMap = this.loadJsonFile('sources_masterlist.json') || {};
  }

  // --- HELPERS DI CARICAMENTO FILE ---

  private loadTextFile(filename: string): string {
    try {
      return fs.readFileSync(path.join(this.kbPath, filename), 'utf-8');
    } catch (e) {
      console.warn(`⚠️ File mancante: ${filename}`);
      return "";
    }
  }

  private loadJsonFile(filename: string): any {
    try {
      const content = fs.readFileSync(path.join(this.kbPath, filename), 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      console.warn(`⚠️ JSON mancante o invalido: ${filename}`);
      return null;
    }
  }

  // --- GESTIONE QUOTA GIORNALIERA (3 SEARCHES/DAY) ---
  
  private async checkAndIncrementQuota(userId: string): Promise<boolean> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Recuperiamo il profilo esistente
    const profile = await db.selectFrom('user_ai_profile')
      .select(['weights', 'user_id'])
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (!profile) return false;

    // Parsiamo stats o inizializziamo
    let stats: UserUsageStats = { last_search_date: today, daily_count: 0 };
    
    // Usiamo il campo 'weights' come storage temporaneo per le stats (per non migrare DB)
    // Se weights contiene già dati di altro tipo, li preserviamo
    let currentWeights: any = profile.weights || {};
    
    if (currentWeights._usage_stats) {
      stats = currentWeights._usage_stats;
    }

    // Reset se è un nuovo giorno
    if (stats.last_search_date !== today) {
      stats.last_search_date = today;
      stats.daily_count = 0;
    }

    // Controllo Limite
    if (stats.daily_count >= MAX_DAILY_SEARCHES) {
      console.warn(`⛔ [QUOTA] Utente ${userId} ha raggiunto il limite di ${MAX_DAILY_SEARCHES} ricerche.`);
      return false;
    }

    // Incremento e Salvataggio
    stats.daily_count++;
    currentWeights._usage_stats = stats;

    await db.updateTable('user_ai_profile')
      .set({ weights: JSON.stringify(currentWeights) })
      .where('user_id', '=', userId)
      .execute();

    console.log(`Hz [QUOTA] Ricerca ${stats.daily_count}/${MAX_DAILY_SEARCHES} autorizzata per oggi.`);
    return true;
  }

  // --- LOGICA DI SELEZIONE FONTI DINAMICA ---
  
  private getTargetSites(interests: string[], dreamRole: string, currentRole: string = ""): string[] {
    // Partiamo con gli aggregatori generalisti + GIG ECONOMY PLATFORMS (Second Income)
    // Aggiungiamo manualmente i giganti del freelancing per coprire il caso "Multi-Account"
    let sites: string[] = [
      ...(this.sourcesMap.aggregators || []),
      "upwork.com", "fiverr.com", "freelancer.com", "toptal.com", "peopleperhour.com"
    ];
    
    const context = (interests.join(' ') + ' ' + dreamRole + ' ' + currentRole).toLowerCase();

    // Logica condizionale per aggiungere categorie specifiche
    if (context.includes('crypto') || context.includes('web3') || context.includes('blockchain') || context.includes('defi')) {
      sites.push(...(this.sourcesMap.crypto_web3 || []));
    }
    if (context.includes('writ') || context.includes('copy') || context.includes('content') || context.includes('blog')) {
      sites.push(...(this.sourcesMap.writing_content || []));
    }
    if (context.includes('dev') || context.includes('code') || context.includes('software') || context.includes('engineer') || context.includes('tech')) {
      sites.push(...(this.sourcesMap.tech_dev || []));
    }
    if (context.includes('design') || context.includes('art') || context.includes('creative') || context.includes('ui') || context.includes('ux')) {
      sites.push(...(this.sourcesMap.design_creative || []));
    }
    if (context.includes('marketing') || context.includes('sales') || context.includes('growth')) {
      sites.push(...(this.sourcesMap.marketing_sales || []));
    }
    if (context.includes('ai') || context.includes('training') || context.includes('annotation') || context.includes('data')) {
      sites.push(...(this.sourcesMap.ai_training || []));
    }
    if (context.includes('research') || context.includes('test') || context.includes('audit')) {
      sites.push(...(this.sourcesMap.high_ticket_microtasks || []));
    }
    
    // Aggiungiamo siti remote-only se la lista è corta
    if (sites.length <= 15) {
      sites.push(...(this.sourcesMap.general_remote || []));
      sites.push(...(this.sourcesMap.async_remote || []));
    }

    return Array.from(new Set(sites)).slice(0, 35); // Aumentato limite a 35 per includere piattaforme Gig
  }

  // --- MOTORE DI RICERCA API ---
  private async searchWeb(systemPrompt: string, userQuery: string): Promise<string> {
    console.log(`🌐 [HUNTER] Deep Search avviata...`);
    const now = new Date().toISOString();
    
    try {
      const response = await axios.post(
        PERPLEXITY_API_URL,
        {
          model: 'sonar-pro', // Modello di punta per ricerca complessa
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `${userQuery} \n\n(Context: Current Date/Time is ${now}. Find LIVE listings only.)` }
          ],
          temperature: 0.1, // Bassa temperatura per JSON rigoroso
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

  /**
   * 🚀 GLOBAL HEADHUNTER SEARCH (Il metodo principale)
   */
  public async findGrowthOpportunities(userId: string, clientProfile: ClientCareerBlueprint) {
    // 1. CONTROLLO QUOTA GIORNALIERA
    const canProceed = await this.checkAndIncrementQuota(userId);
    if (!canProceed) {
      throw new Error(`Quota giornaliera raggiunta (${MAX_DAILY_SEARCHES} ricerche). Riprova domani.`);
    }

    console.log(`🚀 [HUNTER] Analisi Profilo Avanzata per: ${clientProfile.dreamRole}`);

    // 2. Selezione Fonti Intelligente (Inclusi Upwork/Fiverr)
    const targetSites = this.getTargetSites(clientProfile.interests, clientProfile.dreamRole, clientProfile.currentRole);
    const siteListString = targetSites.join(', ');
    
    // 3. Caricamento Logiche dai File
    const seoLogic = this.loadTextFile('dynamic_seo_logic.md');
    const systemInstruction = this.loadTextFile('system_headhunter_prompt.md');

    // 4. Costruzione Prompt Dinamico (Headhunter Mode + Side Hustle Logic)
    const systemPrompt = `
      ${systemInstruction}
      
      ---
      CANDIDATE PROFILE:
      - Target Role: ${clientProfile.dreamRole}
      - Core Skills: ${clientProfile.keySkillsToAcquire.join(', ')}
      - Interests: ${clientProfile.interests.join(', ')}
      - AVOID (Anti-Vision): ${clientProfile.antiVision.join(', ')}
      - Min Pay: ${clientProfile.minHourlyRate} EUR/hr
      
      ---
      SEARCH STRATEGY & LOGIC:
      ${seoLogic}
      
      PRIORITY DOMAINS TO SCAN:
      ${siteListString}

      SPECIAL INSTRUCTION FOR GIG PLATFORMS (Upwork, Fiverr, etc.):
      Since direct listings might be behind a login wall, look for:
      1. Recent public aggregators indexing these gigs.
      2. "Client seeking freelancer" posts on Twitter/Reddit referencing these platforms.
      3. Publicly indexed profile requests matching the candidate's skills.
      
      OBJECTIVE:
      Find both full-time contracts AND high-value "Second Income" side hustles.
    `;

    // 5. Query Master
    const masterQuery = `
      Execute a Deep Search for "${clientProfile.dreamRole}" jobs AND "Freelance/Side-Hustle" opportunities matching the candidate's profile.
      Prioritize listings posted in the last 48 hours on the target domains.
      Ensure the payout meets the minimum requirement (or estimate it realistically based on role seniority).
      Return ONLY a valid JSON Array.
    `;

    const rawResult = await this.searchWeb(systemPrompt, masterQuery);
    await this.processAndSaveOpportunities(rawResult, userId);
  }

  /**
   * ⚙️ Parsing e Salvataggio (Supporta i nuovi campi estesi)
   */
  private async processAndSaveOpportunities(rawJson: string, userId: string | null) {
    try {
      // 1. Pulizia JSON (rimuove markdown ```json ... ```)
      let cleanJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      const start = cleanJson.indexOf('[');
      const end = cleanJson.lastIndexOf(']');
      
      if (start !== -1 && end !== -1) {
        cleanJson = cleanJson.substring(start, end + 1);
      } else {
        console.warn("⚠️ JSON array non trovato nella risposta.");
        return;
      }

      let opportunities: RichOpportunity[] = [];
      try {
        opportunities = JSON.parse(cleanJson);
      } catch (e) {
        console.error("❌ Errore parsing JSON.");
        return;
      }

      console.log(`💰 Trovate ${opportunities.length} opportunità ricche.`);

      for (const opp of opportunities) {
        // Validazione minima
        if (!opp.source_url || !opp.title) continue;

        // 2. Check Duplicati (basato su URL)
        const existing = await db.selectFrom('missions')
          .select('id')
          .where('source_url', '=', opp.source_url)
          .executeTakeFirst();

        if (existing) continue;

        // 3. Parsing Monetario Sicuro (Safe Money Parser)
        const reward = this.parseMoneySafe(opp.payout_estimation);
        
        // 4. Inserimento nel DB (Kysely)
        await db.insertInto('missions')
          .values({
            user_id: userId, 
            title: opp.title.substring(0, 255),
            description: opp.analysis_notes, // Usiamo le note strategiche come descrizione principale
            source_url: opp.source_url,
            raw_category: opp.platform || 'Headhunter Search',
            reward_amount: reward,
            estimated_duration_hours: 1, // Default placeholder
            status: 'pending',
            // created_at: RIMOSSO - Lasciamo fare a Postgres (DEFAULT NOW())
            source: 'global_headhunter',
            
            // Nuovi campi "Ricchi"
            company_name: opp.company_name,
            remote_type: opp.remote_type,
            skills_required: opp.skills_required, // Array di stringhe (Kysely lo gestisce)
            experience_level: opp.experience_level,
            match_score: opp.match_score,
            analysis_notes: opp.analysis_notes,
            
            raw_data: JSON.stringify(opp) 
          })
          .execute();

        console.log(`✅ [DB] Salvata: ${opp.title} @ ${opp.company_name} (Rate stimato: €${reward}/hr)`);
      }

    } catch (e) {
      console.error('❌ Errore critico durante il salvataggio:', e);
    }
  }

  // --- HELPER DI CONVERSIONE MONETARIA SICURO ---
  private parseMoneySafe(input: string): number {
    if (!input) return 0;
    
    // Rimuove tutto tranne numeri, punti e 'k'
    const clean = input.toLowerCase().replace(/[^0-9.k]/g, ''); 
    
    let val = parseFloat(clean.replace('k', '')) || 0;
    if (clean.includes('k')) val *= 1000;

    // Logica "Annual Salary" -> "Hourly Rate"
    // Se > 15.000 è quasi sicuramente annuale -> dividiamo per 2000 ore
    if (input.toLowerCase().includes('year') || input.toLowerCase().includes('yr') || input.toLowerCase().includes('annum') || val > 15000) {
      val = val / 2000;
    } 
    // Se > 1.000 ma < 15.000 è probabilmente mensile -> dividiamo per 160 ore
    else if (input.toLowerCase().includes('month') || input.toLowerCase().includes('mo') || (val > 1000 && val <= 15000)) {
      val = val / 160;
    }

    // Limite di Sicurezza DB (Max 999.00 per evitare overflow su DECIMAL(10,2))
    if (val > 9999) return 9999;

    return parseFloat(val.toFixed(2));
  }
}