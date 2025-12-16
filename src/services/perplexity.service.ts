import axios from 'axios';
import { db } from '../infra/db';
import fs from 'fs';
import path from 'path';

export class PerplexityService {
  private kbPath: string;

  constructor() {
    const isProd = process.env.NODE_ENV === 'production';
    // Gestione percorsi sia in locale (src) che in produzione (dist)
    this.kbPath = isProd 
      ? path.join(process.cwd(), 'dist', 'knowledge_base')
      : path.join(process.cwd(), 'src', 'knowledge_base');
  }

  /**
   * Helper: Carica il contenuto testuale di un file dalla Knowledge Base.
   * Cerca in diverse sottocartelle per robustezza.
   */
  private loadTextFile(filename: string): string {
    try {
      const possiblePaths = [
        path.join(this.kbPath, filename),
        path.join(this.kbPath, 'developer', filename),
        path.join(process.cwd(), 'src', 'knowledge_base', filename) // Fallback sviluppo
      ];

      for (const p of possiblePaths) {
        if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8');
      }

      console.warn(`⚠️ File KB non trovato: ${filename}`);
      return "";
    } catch (e) {
      console.error(`Errore lettura file ${filename}:`, e);
      return "";
    }
  }

  /**
   * Entry Point: Avvia la ricerca di opportunità.
   * @param mode 'daily' | 'weekly' | 'monthly' - Definisce l'orizzonte temporale.
   */
  public async findGrowthOpportunities(userId: string, clientProfile: any, mode: 'daily' | 'weekly' | 'monthly' = 'daily'): Promise<number> {
    console.log(`\n🚀 [PERPLEXITY] Avvio Caccia: ${mode.toUpperCase()} per User ${userId}`);

    // 1. Determina la "Recency" (Quanto indietro nel tempo guardare)
    let recency = 'day'; // Default Daily (24h)
    if (mode === 'weekly') recency = 'week';   // 7 giorni
    if (mode === 'monthly') recency = 'month'; // 30 giorni

    // 2. Esegui la ricerca forzata sul Protocollo C
    return await this.performSearch(userId, clientProfile, mode, recency);
  }

  /**
   * Logica Core: Esegue la chiamata a Perplexity usando il Manuale C come UNICA fonte di verità.
   */
  private async performSearch(userId: string, clientProfile: any, mode: string, recency: string): Promise<number> {
    
    // --- STEP 1: CARICAMENTO DEL "CERVELLO" (IL PROTOCOLLO) ---
    // Questo file definisce COSA cercare (AI Tutor, Tester, ecc.), ignorando il profilo utente.
    const searchProtocol = this.loadTextFile('manual_c_easy_income.md');
    
    if (!searchProtocol) {
        console.error("❌ ERRORE CRITICO: 'manual_c_easy_income.md' non trovato. Impossibile eseguire ricerca mirata.");
        throw new Error("Protocollo di ricerca mancante (Manual C).");
    }

    // --- STEP 2: SELEZIONE DELLA "PERSONALITÀ" (L'HEADHUNTER) ---
    // Questo definisce COME cercare (il tono e lo stile), ma non COSA cercare.
    let systemInstructionFile = 'system_headhunter_prompt.md'; // Default Daily
    if (mode === 'weekly') systemInstructionFile = 'system_headhunter_weekly.md';
    if (mode === 'monthly') systemInstructionFile = 'system_headhunter_monthly.md';

    let systemBehavior = this.loadTextFile(systemInstructionFile);
    // Fallback se il prompt specifico non esiste
    if (!systemBehavior) systemBehavior = "You are an expert headhunter finding high-value remote gigs.";

    // --- STEP 3: COSTRUZIONE DEL CONTESTO (FORZATURA TOTALE) ---
    // Qui sovrascriviamo esplicitamente qualsiasi "Dream Role" precedente dell'utente.
    const searchContext = `
      ⚠️ CRITICAL INSTRUCTION: OVERRIDE ALL PREVIOUS USER PROFILES.
      
      Do NOT search for "Developer", "Programmer", "Software Engineer" or generic jobs unless explicitly stated in the Protocol below.
      Ignore the user's DB profile if it conflicts with the Protocol.

      YOU MUST FIND JOBS MATCHING STRICTLY THE FOLLOWING "QUICK YIELD" PROTOCOL:
      
      === START PROTOCOL (SOURCE OF TRUTH) ===
      ${searchProtocol}
      === END PROTOCOL ===

      --- 🎯 SEARCH PARAMETERS ---
      TIMEFRAME: Opportunities published in the last ${recency === 'day' ? '24 HOURS' : '7 DAYS'}.
      LOCATION: Remote (Italy preferred, Europe/Global allowed if explicitly stated in Protocol).
      FILTERS: 
      - NO Surveys / Sondaggi.
      - NO MLM / Network Marketing.
      - NO Cold Calling.
      
      YOUR GOAL: Find 5 concrete, active job listings that match the "Pillars" defined in the Protocol above.
      OUTPUT FORMAT: Provide a valid JSON Array exactly as requested in the Protocol.
    `;

    // --- STEP 4: CHIAMATA API ---
    console.log(`🔍 [QUERY] Ricerca in corso su Perplexity (Model: sonar-pro)...`);
    
    try {
      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'sonar-pro', 
          messages: [
            { role: 'system', content: systemBehavior },
            { role: 'user', content: searchContext }
          ],
          temperature: 0.1, // Bassa temperatura per seguire le regole rigidamente
          max_tokens: 4000
        },
        { headers: { 'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}` } }
      );

      const rawContent = response.data.choices[0].message.content;
      console.log(`✅ [PERPLEXITY] Risposta ricevuta (${rawContent.length} chars). Elaborazione...`);
      
      return await this.processAndSaveOpportunities(rawContent, userId, mode as any);

    } catch (error: any) {
      console.error("❌ Errore API Perplexity:", error.response?.data || error.message);
      return 0;
    }
  }

  /**
   * Processa il JSON grezzo di Perplexity e salva le missioni nel DB.
   */
  private async processAndSaveOpportunities(rawContent: string, userId: string, type: 'daily' | 'weekly' | 'monthly'): Promise<number> {
    let opportunities = [];
    
    try {
      // Pulizia del JSON (rimuove i backticks del markdown ```json ... ```)
      const jsonStr = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
      opportunities = JSON.parse(jsonStr);
    } catch (e) {
      console.error("⚠️ Errore parsing JSON da Perplexity. Il formato ricevuto potrebbe non essere valido.");
      console.debug("Raw Content Preview:", rawContent.substring(0, 100));
      return 0;
    }

    if (!Array.isArray(opportunities) || opportunities.length === 0) {
        console.warn("⚠️ Nessuna opportunità valida trovata nel JSON.");
        return 0;
    }

    let savedCount = 0;
    console.log(`💾 Salvataggio di ${opportunities.length} nuove missioni (Target: Manual C Protocol)...`);

    for (const opp of opportunities) {
      // Verifica duplicati (basata su URL o Titolo+Azienda)
      const existing = await db.selectFrom('missions')
        .select('id')
        .where('user_id', '=', userId)
        .where((eb) => eb.or([
          eb('source_url', '=', opp.action_link || opp.url),
          eb.and([
            eb('title', '=', opp.title),
            eb('company_name', '=', opp.platform || opp.company)
          ])
        ]))
        .executeTakeFirst();

      if (!existing) {
        await db.insertInto('missions')
          .values({
            id: crypto.randomUUID(),
            user_id: userId,
            title: opp.title,
            company_name: opp.platform || opp.company || "Confidenziale",
            description: `${opp.why_it_works || ''}\n\nDifficulty: ${opp.difficulty || 'N/A'}\n\n${opp.description || ''}`,
            source_url: opp.action_link || opp.url || "#",
            reward_amount: this.parseReward(opp.hourly_rate || opp.reward),
            estimated_duration_hours: 1, // Default per task rapidi
            status: 'pending',
            type: type, // Mantiene Daily/Weekly/Monthly per l'UI
            platform: "Easy Income Protocol", // Tagghiamo chiaramente la fonte
            match_score: 99, // Forza alta priorità nel sorting
            created_at: new Date(),
            raw_data: JSON.stringify(opp)
          })
          .execute();
        savedCount++;
      }
    }

    console.log(`✅ Salvate ${savedCount} missioni.`);
    return savedCount;
  }

  /**
   * Helper per estrarre numeri dalla stringa del compenso.
   * Es. "$20-25/h" -> 20
   */
  private parseReward(rewardStr: string): number {
    if (!rewardStr) return 0;
    const matches = rewardStr.match(/\d+/);
    return matches ? parseInt(matches[0], 10) : 0;
  }
}