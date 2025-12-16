import axios from 'axios';
import { db } from '../infra/db';
import fs from 'fs';
import path from 'path';

export class PerplexityService {
  private kbPath: string;

  constructor() {
    const isProd = process.env.NODE_ENV === 'production';
    // Gestione percorsi per trovare i prompt di sistema (comportamento Headhunter)
    this.kbPath = isProd 
      ? path.join(process.cwd(), 'dist', 'knowledge_base')
      : path.join(process.cwd(), 'src', 'knowledge_base');
  }

  /**
   * Helper: Carica file di sistema (es. il tono di voce dell'Headhunter).
   * NON viene più usato per caricare il "cosa cercare", ma solo il "come comportarsi".
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
      console.error(`Errore lettura file sistema ${filename}:`, e);
      return "";
    }
  }

  /**
   * --- IL CUORE DINAMICO ---
   * Trasforma il JSON del profilo utente (dal DB) in un Prompt di Ricerca strutturato.
   */
  private generateUserProtocol(profile: any): string {
    // 1. Fallback se il profilo è vuoto o non ancora compilato
    if (!profile || !profile.dreamRole) {
        return `
        === GENERIC SEARCH PROTOCOL ===
        TARGET: Remote Freelance Opportunities
        SKILLS: General Tech & Digital Skills
        CONTEXT: The user has not defined a specific profile yet. Find high-quality remote jobs suitable for a digital nomad.
        `;
    }

    // 2. Estrazione e Pulizia Dati
    const dreamRole = profile.dreamRole;
    
    // Gestione array vs stringhe (per robustezza)
    const formatList = (val: any) => Array.isArray(val) ? val.join(", ") : (val || "None");
    
    const antiVision = formatList(profile.antiVision);
    const skills = formatList(profile.keySkillsToAcquire);
    const advantages = formatList(profile.unfairAdvantages);
    const specificQuestions = profile.specificQuestions || "No specific extra instructions.";

    // 3. Costruzione Prompt Personalizzato
    return `
    === USER CUSTOM MANIFESTO (SOURCE OF TRUTH) ===
    
    1. 🎯 PRIMARY OBJECTIVE (The Hunt Target):
       "${dreamRole}"
       -> The AI must PRIORITIZE this specific role/niche above all else.

    2. ⚡ USER ASSETS (Keywords to Match):
       Skills & Advantages: ${skills}, ${advantages}
       -> Use these keywords to verify job fit.

    3. ⛔ STRICT EXCLUSIONS (The Anti-Vision):
       Do NOT include jobs that involve: ${antiVision}
       -> Filter these out aggressively.

    4. 📝 SPECIFIC USER INSTRUCTIONS / QUESTIONS:
       "${specificQuestions}"
       -> Pay close attention to these custom constraints or requests.

    ==============================================
    `;
  }

  /**
   * Entry Point: Avvia la ricerca (Daily/Weekly/Monthly).
   */
  public async findGrowthOpportunities(userId: string, clientProfile: any, mode: 'daily' | 'weekly' | 'monthly' = 'daily'): Promise<number> {
    console.log(`\n🚀 [PERPLEXITY] Avvio Caccia ${mode.toUpperCase()} su misura per User: ${userId}`);

    // Generiamo il protocollo specifico per QUESTO utente in QUESTO momento
    const userProtocol = this.generateUserProtocol(clientProfile);

    // Determina l'orizzonte temporale
    let recency = 'day'; // Default Daily (24h)
    if (mode === 'weekly') recency = 'week';   // 7 giorni
    if (mode === 'monthly') recency = 'month'; // 30 giorni

    return await this.performSearch(userId, userProtocol, mode, recency);
  }

  /**
   * Esegue la ricerca su Perplexity usando il Protocollo Generato.
   */
  private async performSearch(userId: string, protocol: string, mode: string, recency: string): Promise<number> {
    
    // Carichiamo il "Character" dell'Headhunter (file statico di sistema)
    let systemInstructionFile = 'system_headhunter_prompt.md';
    if (mode === 'weekly') systemInstructionFile = 'system_headhunter_weekly.md';
    
    let systemBehavior = this.loadTextFile(systemInstructionFile);
    if (!systemBehavior) systemBehavior = "You are an expert headhunter finding high-value remote gigs.";

    // Costruiamo il messaggio finale per l'AI
    const searchContext = `
      ⚠️ CRITICAL: IGNORE any previous generic instructions. 
      Follow the USER CUSTOM MANIFESTO below strictly.

      ${protocol}

      --- 🎯 SEARCH PARAMETERS ---
      TIMEFRAME: Opportunities published in the last ${recency === 'day' ? '24 HOURS' : '7 DAYS'}.
      LOCATION: Remote (Global/Europe preferred unless User specified otherwise).
      
      YOUR GOAL: Find 5 concrete, active job listings that match the USER MANIFESTO.
      
      OUTPUT FORMAT:
      Return a valid JSON Array. Each object must have:
      - title: Job Title
      - platform: Company or Platform Name
      - hourly_rate: Estimated pay (string)
      - difficulty: "High", "Medium", or "Low" based on requirements
      - action_link: Direct URL to apply
      - why_it_works: One sentence explaining why this fits the User Manifesto.
    `;

    console.log(`🔍 [QUERY] Esecuzione ricerca dinamica su Perplexity...`);
    
    try {
      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'sonar-pro', 
          messages: [
            { role: 'system', content: systemBehavior },
            { role: 'user', content: searchContext }
          ],
          temperature: 0.1, // Bassa temperatura per rispettare i vincoli
          max_tokens: 4000
        },
        { headers: { 'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}` } }
      );

      const rawContent = response.data.choices[0].message.content;
      console.log(`✅ [PERPLEXITY] Risposta ricevuta. Elaborazione...`);
      
      return await this.processAndSaveOpportunities(rawContent, userId, mode as any);

    } catch (error: any) {
      console.error("❌ Errore API Perplexity:", error.response?.data || error.message);
      return 0;
    }
  }

  /**
   * Processa il JSON e salva nel DB.
   */
  private async processAndSaveOpportunities(rawContent: string, userId: string, type: 'daily' | 'weekly' | 'monthly'): Promise<number> {
    let opportunities = [];
    
    try {
      // Pulizia del JSON (rimuove i backticks del markdown)
      const jsonStr = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
      opportunities = JSON.parse(jsonStr);
    } catch (e) {
      console.error("⚠️ Errore parsing JSON da Perplexity.");
      return 0;
    }

    if (!Array.isArray(opportunities) || opportunities.length === 0) {
        console.warn("⚠️ Nessuna opportunità valida trovata.");
        return 0;
    }

    let savedCount = 0;
    
    for (const opp of opportunities) {
      // Verifica duplicati per evitare spam
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
            company_name: opp.platform || opp.company || "N/A",
            description: `${opp.why_it_works || ''}\n\nRequisiti: ${opp.difficulty || 'N/A'}\n${opp.description || ''}`,
            source_url: opp.action_link || opp.url || "#",
            reward_amount: this.parseReward(opp.hourly_rate || opp.reward),
            estimated_duration_hours: 1, 
            status: 'pending',
            type: type,
            platform: "Custom User Hunt", // Tagghiamo la provenienza
            match_score: 100, // Massima priorità perché richiesto dall'utente
            created_at: new Date(),
            raw_data: JSON.stringify(opp)
          })
          .execute();
        savedCount++;
      }
    }

    console.log(`✅ Salvate ${savedCount} nuove missioni personalizzate.`);
    return savedCount;
  }

  // Helper per estrarre numeri (es. "$25/h" -> 25)
  private parseReward(rewardStr: string): number {
    if (!rewardStr) return 0;
    const matches = rewardStr.match(/\d+/);
    return matches ? parseInt(matches[0], 10) : 0;
  }
}