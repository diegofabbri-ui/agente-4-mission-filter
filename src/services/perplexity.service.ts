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
    
    // Gestione percorsi cross-platform (Dev/Prod)
    const isProd = process.env.NODE_ENV === 'production' || __dirname.includes('dist');
    this.kbPath = isProd 
      ? path.join(process.cwd(), 'dist', 'knowledge_base')
      : path.join(process.cwd(), 'src', 'knowledge_base');
  }

  /**
   * Carica i file dalla Knowledge Base cercando in più posizioni possibili
   */
  private loadKBFile(filename: string): string {
    const pathsToTry = [
      path.join(this.kbPath, filename),
      path.join(process.cwd(), 'src', 'knowledge_base', filename),
      path.join(process.cwd(), 'dist', 'knowledge_base', filename)
    ];

    for (const p of pathsToTry) {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf-8');
      }
    }
    console.warn(`⚠️ File non trovato: ${filename}`);
    return "";
  }

  /**
   * Genera la query SEO dinamica basata sul profilo utente
   */
  private generateSearchQuery(profile: any, mode: string): string {
    const role = profile.dreamRole || profile.role || "Remote Professional";
    const timeframe = mode === 'daily' ? 'last 24 hours' : 'last 7 days';

    // Query pulita per non confondere Perplexity con troppi dati
    return `
      OBJECTIVE: Find high-ROI remote micro-tasks for: "${role}".
      TIMEFRAME: Published in the ${timeframe}.
      CRITERIA: Tasks solvable in 30-60 minutes (urgent fixes, setups, audits).
      SEARCH STRATEGY: Scour job boards, gig marketplaces, and social threads.
      REQUIREMENT: Each result MUST have a direct application URL.
    `;
  }

  /**
   * CORE: Algoritmo a due fasi (Hunter + Auditor)
   */
  public async findGrowthOpportunities(
    userId: string, 
    clientProfile: any, 
    mode: 'daily' | 'weekly' | 'monthly' = 'daily'
  ): Promise<number> {
    console.log(`\n🚀 [SNIPER ENGINE] Avvio Caccia ${mode.toUpperCase()} - User: ${userId}`);

    // --- FASE 1: THE HUNTER (Perplexity Sonar-Pro) ---
    const hunterPrompt = this.loadKBFile('system_headhunter_prompt.md');
    const searchQuery = this.generateSearchQuery(clientProfile, mode);

    let rawResults = [];
    try {
      console.log("🔍 [PHASE 1] Hunter in azione (Perplexity)...");
      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'sonar-pro', 
          messages: [
            { role: 'system', content: hunterPrompt },
            { role: 'user', content: searchQuery }
          ],
          temperature: 0.2
        },
        { headers: { 'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}` } }
      );

      const content = response.data.choices[0].message.content;
      
      // Log di debug per ispezionare la risposta grezza
      console.log("📥 [PHASE 1] Risposta ricevuta (anteprima):", content.substring(0, 150) + "...");

      const jsonMatch = content.match(/\[.*\]/s);
      rawResults = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      console.log(`📊 [PHASE 1] Trovate ${rawResults.length} potenziali missioni.`);
    } catch (error: any) {
      console.error("❌ Errore Fase Hunter:", error.message);
      return 0;
    }

    if (rawResults.length === 0) {
      console.log("⚠️ Nessuna missione trovata dal cacciatore. Fine ciclo.");
      return 0;
    }

    // --- FASE 2: THE AUDITOR (OpenAI GPT-4o) ---
    const auditorPrompt = this.loadKBFile('system_headhunter_daily_reviewer.md');
    const blacklist = this.loadKBFile('global_blacklist.json');

    let approvedMissions = [];
    try {
      console.log("🛡️ [PHASE 2] Avvio Revisione Strategica (Auditor)...");
      const auditResponse = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { 
            role: "system", 
            content: auditorPrompt || "You are a job reviewer. Filter the list for 30-60 min tasks. Return JSON." 
          },
          { 
            role: "user", 
            content: `USER PROFILE: ${JSON.stringify(clientProfile)}\n\nBLACKLIST: ${blacklist}\n\nLEADS TO AUDIT: ${JSON.stringify(rawResults)}` 
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0
      });

      const auditData = JSON.parse(auditResponse.choices[0].message.content || "{}");
      // Supportiamo diversi formati di risposta dell'AI
      approvedMissions = auditData.approved_missions || auditData.missions || [];
      console.log(`✅ [PHASE 2] ${approvedMissions.length} missioni hanno superato il filtro Sniper.`);
    } catch (error: any) {
      console.error("❌ Errore Fase Auditor:", error.message);
      return 0;
    }

    // --- SALVATAGGIO ---
    return await this.saveMissions(userId, approvedMissions, mode);
  }

  /**
   * Salva le missioni nel DB evitando duplicati tramite URL
   */
  private async saveMissions(userId: string, opportunities: any[], mode: string): Promise<number> {
    let count = 0;
    for (const opp of opportunities) {
      try {
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
              title: opp.title || "Untitled Mission",
              company_name: opp.company_name || "N/A",
              description: opp.reason || opp.snippet || "Nessuna descrizione fornita.",
              source_url: opp.source_url,
              reward_amount: this.extractNumericReward(opp.salary_raw || opp.reward_amount),
              estimated_duration_hours: 1, // Default Sniper 30-60 min
              status: 'pending',
              type: mode as any,
              platform: opp.platform || "Web",
              match_score: opp.match_score || 80,
              created_at: new Date().toISOString() as any
            })
            .execute();
          count++;
        }
      } catch (err) {
        console.error("⚠️ Errore salvataggio singola missione:", err);
      }
    }
    console.log(`💾 Ciclo concluso. ${count} nuove missioni salvate.`);
    return count;
  }

  /**
   * Helper per pulire i valori monetari
   */
  private extractNumericReward(val: any): number {
    if (typeof val === 'number') return val;
    if (!val) return 20; // Default reward per task sniper
    const cleaned = val.toString().replace(/[^0-9]/g, '');
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? 20 : (num > 1000 ? Math.floor(num/2000) : num);
  }
}