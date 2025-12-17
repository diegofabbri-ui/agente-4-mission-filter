import axios from 'axios';
import { db } from '../infra/db';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import OpenAI from 'openai';

export class PerplexityService {
  private kbPath: string;
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const isProd = process.env.NODE_ENV === 'production';
    // Gestione dinamica dei percorsi per Dev e Prod
    this.kbPath = isProd 
      ? path.join(process.cwd(), 'dist', 'knowledge_base')
      : path.join(process.cwd(), 'src', 'knowledge_base');
  }

  /**
   * Carica file dalla Knowledge Base cercando in varie sottocartelle
   */
  private loadTextFile(filename: string): string {
    try {
      const possiblePaths = [
        path.join(this.kbPath, filename),
        path.join(this.kbPath, 'developer', filename),
        path.join(this.kbPath, 'guardrails', filename),
        path.join(process.cwd(), 'src', 'knowledge_base', filename) // Fallback diretto
      ];

      for (const p of possiblePaths) {
        if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8');
      }
      // Se il file è opzionale, non intasare i log, ma se è critico serve saperlo
      if (filename.includes('prompt') || filename.includes('reviewer')) {
          console.warn(`⚠️ File KB non trovato: ${filename}`);
      }
      return "";
    } catch (e) { return ""; }
  }

  /**
   * Genera il contesto di ricerca dinamico basato sul profilo utente
   */
  private generateSearchContext(profile: any, mode: string): string {
    const aiData = profile.generatedSearchLogic || {};
    
    // 1. Costruzione Query Booleana (Dynamic SEO Logic)
    const posKeywords = Array.isArray(aiData.positive_keywords) 
        ? aiData.positive_keywords.join(" OR ") 
        : (profile.dreamRole || "Remote Jobs");
        
    const negKeywords = Array.isArray(aiData.negative_keywords) 
        ? aiData.negative_keywords.join(" -") 
        : "";

    // 2. Caricamento Fonti (Sources Masterlist)
    const sourcesRaw = this.loadTextFile('sources_masterlist.json');
    let targetSites = "";
    try {
        const src = JSON.parse(sourcesRaw);
        if (src.global_remote_platforms) {
            // Estrae i domini per creare operatori site: (es. site:greenhouse.io OR site:lever.co)
            targetSites = src.global_remote_platforms
                .map((s:any) => `site:${new URL(s.url).hostname}`)
                .slice(0, 15) // Limitiamo a 15 per non rompere il prompt
                .join(" OR ");
        }
    } catch(e) {
        // Fallback se il JSON fallisce
        targetSites = "site:greenhouse.io OR site:lever.co OR site:weworkremotely.com"; 
    }

    // 3. Definizione Recency
    let recency = '24h';
    if (mode === 'weekly') recency = '7d';
    if (mode === 'monthly') recency = '30d';

    return `
    SEARCH QUERY LOGIC: 
    (${posKeywords}) AND ("remote" OR "contract") ${negKeywords ? '-' + negKeywords : ''}
    
    SOURCE TARGETING (Priority):
    ${targetSites}
    
    TIMEFRAME: Last ${recency}
    
    TASK: Find 10-15 RAW job listings. 
    NOTE: Do not filter strictly yet. The Auditor will clean the list.
    OUTPUT: JSON Array with keys: title, company_name, source_url, snippet, salary_raw.
    `;
  }

  /**
   * --- MAIN ENTRY POINT ---
   * Esegue la ricerca a due fasi: Hunter (Perplexity) -> Auditor (GPT-4o)
   */
  public async findGrowthOpportunities(userId: string, clientProfile: any, mode: 'daily' | 'weekly' | 'monthly' = 'daily'): Promise<number> {
    console.log(`\n🚀 [PERPLEXITY] Avvio Caccia ${mode.toUpperCase()} (Protocollo A3-A)`);

    // --- FASE 1: THE HUNTER (Perplexity) ---
    // Obiettivo: Trovare volume, non perfezione.
    
    // Selezione Prompt Hunter
    let hunterFile = 'system_headhunter_prompt.md'; // Daily
    if (mode === 'weekly') hunterFile = 'system_headhunter_weekly.md';
    if (mode === 'monthly') hunterFile = 'system_headhunter_monthly.md';

    const hunterSystemPrompt = this.loadTextFile(hunterFile);
    const searchContext = this.generateSearchContext(clientProfile, mode);

    let rawResults = [];
    try {
        console.log("🔍 [PHASE 1] Hunter Searching via Perplexity...");
        const response = await axios.post(
            'https://api.perplexity.ai/chat/completions',
            {
                model: 'sonar-pro', 
                messages: [
                    { role: 'system', content: hunterSystemPrompt },
                    { role: 'user', content: searchContext }
                ],
                temperature: 0.3, // Un po' di creatività per trovare più risultati
                max_tokens: 4000
            },
            { headers: { 'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}` } }
        );
        
        // Pulizia JSON aggressiva
        const cleanJson = response.data.choices[0].message.content
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();
            
        // Estrae solo l'array se c'è testo attorno
        const arrayMatch = cleanJson.match(/\[.*\]/s);
        const jsonToParse = arrayMatch ? arrayMatch[0] : cleanJson;

        rawResults = JSON.parse(jsonToParse);
        console.log(`📥 [PHASE 1] Trovati ${rawResults.length} risultati grezzi.`);

    } catch (e: any) {
        console.error("❌ Errore Hunter (Perplexity):", e.message);
        return 0;
    }

    if (!rawResults || rawResults.length === 0) {
        console.warn("⚠️ Nessun risultato grezzo trovato. Caccia abortita.");
        return 0;
    }

    // --- FASE 2: THE AUDITOR (GPT-4o / Guardrail) ---
    // Obiettivo: Filtrare con Blacklist e Sniper Protocol.

    // Selezione Prompt Reviewer
    let reviewerFile = 'system_headhunter_daily_reviewer.md'; // Daily (se non esiste usa weekly come fallback o crea file vuoto)
    if (mode === 'weekly') reviewerFile = 'system_headhunter_weekly_reviewer.md';
    if (mode === 'monthly') reviewerFile = 'system_headhunter_monthly_reviewer.md';

    let reviewerSystemPrompt = this.loadTextFile(reviewerFile);
    
    // Se manca il reviewer giornaliero, usiamo il protocollo manuale come istruzione
    if (!reviewerSystemPrompt && mode === 'daily') {
        const sniperProtocol = this.loadTextFile('manual_a_sniper_protocol.md');
        reviewerSystemPrompt = `You are the Daily Auditor. Use these rules to filter jobs:\n${sniperProtocol}\nOutput strictly JSON Array of approved jobs.`;
    }

    const blacklist = this.loadTextFile('global_blacklist.json');

    let approvedMissions = [];
    try {
        console.log("🛡️ [PHASE 2] Guardrail Auditing via GPT-4o...");
        
        const reviewResponse = await this.openai.chat.completions.create({
            model: "gpt-4o", 
            messages: [
                { role: "system", content: reviewerSystemPrompt || "Filter these jobs. Remove scams. Return JSON." },
                { role: "user", content: `
                    GLOBAL BLACKLIST: ${blacklist}
                    
                    RAW LEADS TO AUDIT: 
                    ${JSON.stringify(rawResults)}
                    
                    TASK: Return ONLY the valid jobs as a JSON Array.
                `}
            ],
            response_format: { type: "json_object" },
            temperature: 0 // Zero creatività, pura logica di filtro
        });

        const reviewedData = JSON.parse(reviewResponse.choices[0].message.content || "{}");
        
        // Supporta sia formato { approved_missions: [] } che array diretto []
        if (Array.isArray(reviewedData)) {
            approvedMissions = reviewedData;
        } else if (reviewedData.approved_missions && Array.isArray(reviewedData.approved_missions)) {
            approvedMissions = reviewedData.approved_missions;
        } else if (reviewedData.jobs && Array.isArray(reviewedData.jobs)) {
            approvedMissions = reviewedData.jobs;
        } else {
            // Fallback estremo: se il formato è strano, prendiamo tutto quello che sembra un array
            approvedMissions = Object.values(reviewedData).find(val => Array.isArray(val)) as any[] || [];
        }

        console.log(`✅ [PHASE 2] Approvate ${approvedMissions.length} missioni su ${rawResults.length}.`);

    } catch (e: any) {
        console.error("❌ Errore Reviewer (Guardrail):", e.message);
        // Fallback di emergenza: se il reviewer crasha, salva i primi 3 raw pur di non dare 0
        console.warn("⚠️ Uso fallback raw results (Primi 3).");
        approvedMissions = rawResults.slice(0, 3);
    }

    // --- SALVATAGGIO ---
    return await this.saveToDb(userId, approvedMissions, mode);
  }

  /**
   * Salva le missioni nel DB, evitando duplicati
   */
  private async saveToDb(userId: string, opportunities: any[], type: string): Promise<number> {
    let savedCount = 0;
    
    for (const opp of opportunities) {
        // Guardrail Finale: Validità Link minima
        if (!opp.source_url || opp.source_url.length < 5 || !opp.source_url.includes('.')) continue;

        const existing = await db.selectFrom('missions')
            .select('id')
            .where('user_id', '=', userId)
            .where('source_url', '=', opp.source_url)
            .executeTakeFirst();

        if (!existing) {
            await db.insertInto('missions')
                .values({
                    id: crypto.randomUUID(),
                    user_id: userId,
                    title: opp.title || "Missione Senza Titolo",
                    company_name: opp.company_name || "N/A",
                    // Combina snippet e reason del reviewer
                    description: `${opp.reason || ''}\n\n${opp.snippet || opp.description || ''}`,
                    source_url: opp.source_url,
                    reward_amount: this.parseReward(opp.reward_amount || opp.hourly_rate || opp.salary_raw),
                    estimated_duration_hours: opp.estimated_hours || 1, 
                    status: 'pending',
                    type: type as any,
                    platform: opp.platform || "AI Hunter",
                    match_score: opp.match_score || 85,
                    created_at: new Date().toISOString() as any, // FIX DATA TYPE
                    raw_data: JSON.stringify(opp)
                })
                .execute();
            savedCount++;
        }
    }
    return savedCount;
  }

  /**
   * Parser Prezzi Intelligente
   * Converte "80k/yr", "$50/hr", "2000 month" in un numero intero (tariffa oraria stimata)
   */
  private parseReward(val: any): number {
      if (typeof val === 'number') return val;
      if (!val) return 0;
      
      const str = val.toString().toLowerCase().replace(/,/g, '').replace(/\./g, '');
      
      // 1. Gestione Annuale ("80k", "100000")
      if (str.includes('k') || str.includes('yr') || str.includes('year') || str.includes('annum')) {
          const matches = str.match(/(\d+)/);
          if (matches) {
              let num = parseInt(matches[0], 10);
              if (num < 1000) num *= 1000; // 80 -> 80000
              return Math.floor(num / 2000); // Stima oraria (2000 ore lavorative)
          }
      }

      // 2. Gestione Mensile
      if (str.includes('mo') || str.includes('month')) {
          const matches = str.match(/(\d+)/);
          if (matches) {
              let num = parseInt(matches[0], 10);
              return Math.floor(num / 160); // Stima oraria (160 ore mese)
          }
      }

      // 3. Gestione Oraria Diretta
      const matches = str.match(/(\d+)/);
      return matches ? parseInt(matches[0], 10) : 0;
  }
}