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
    
    // Gestione percorsi robusta per Dev e Produzione (Railway/Aruba)
    const isProd = process.env.NODE_ENV === 'production' || __dirname.includes('dist');
    this.kbPath = isProd 
      ? path.join(process.cwd(), 'dist', 'knowledge_base')
      : path.join(process.cwd(), 'src', 'knowledge_base');
  }

  /**
   * Carica i file di conoscenza (Markdown/JSON) con fallback
   */
  private loadKBFile(filename: string): string {
    const pathsToTry = [
      path.join(this.kbPath, filename),
      path.join(process.cwd(), 'src', 'knowledge_base', filename),
      path.join(process.cwd(), 'dist', 'knowledge_base', filename)
    ];

    for (const p of pathsToTry) {
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8');
    }
    return "";
  }

  /**
   * 🔍 FASE 1: Query di ricerca ampia per evitare "0 risultati"
   * L'obiettivo è trovare molti contratti Freelance/Remote, lasciando il filtro del tempo all'Auditor.
   */
  private generateSearchQuery(profile: any, mode: string): string {
    const role = profile.dreamRole || profile.role || "Professional";
    const timeframe = mode === 'daily' ? 'last 24 hours' : 'last 7 days';

    return `
      Find ALL new remote freelance, contract, or part-time opportunities for: "${role}".
      Timeframe: Posted in the ${timeframe}.
      Requirements: Must be 100% remote. Exclude full-time permanent positions.
      Focus: Look for project-based work, immediate needs, or technical gig platforms.
    `;
  }

  /**
   * ⚡ CORE ALGORITHM: Hunter (Volume) + Auditor (Qualità)
   */
  public async findGrowthOpportunities(
    userId: string, 
    clientProfile: any, 
    mode: 'daily' | 'weekly' | 'monthly' = 'daily'
  ): Promise<number> {
    console.log(`\n🕵️‍♂️ [SNIPER ENGINE] Avvio ricerca ${mode.toUpperCase()} per User: ${userId}`);

    // --- FASE 1: THE HUNTER (Perplexity) ---
    const hunterPrompt = this.loadKBFile('system_headhunter_prompt.md');
    const searchQuery = this.generateSearchQuery(clientProfile, mode);

    let rawResults = [];
    try {
      console.log("📡 [PHASE 1] Interrogazione Perplexity (Sonar-Pro)...");
      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'sonar-pro', 
          messages: [
            { role: 'system', content: hunterPrompt },
            { role: 'user', content: searchQuery }
          ],
          temperature: 0.3
        },
        { headers: { 'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}` } }
      );

      const content = response.data.choices[0].message.content;
      console.log("📥 [PHASE 1] Risposta Raw ricevuta. Estrazione JSON...");

      // Estrae l'array JSON dalla risposta (gestisce eventuale testo extra)
      const jsonMatch = content.match(/\[.*\]/s);
      rawResults = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      console.log(`📊 [PHASE 1] Il Cacciatore ha trovato ${rawResults.length} potenziali tracce.`);

    } catch (error: any) {
      console.error("❌ [PHASE 1] Errore critico Hunter:", error.message);
      return 0;
    }

    if (rawResults.length === 0) {
      console.log("⚠️ Nessun dato grezzo trovato. Caccia terminata.");
      return 0;
    }

    // --- FASE 2: THE AUDITOR (OpenAI GPT-4o) ---
    // Qui applichiamo il filtro severo per i task da 30-60 minuti
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
            content: auditorPrompt || "You are an expert auditor. Select only freelance/contract tasks that seem solvable in 30-60 min. Return a JSON array under 'approved_missions'." 
          },
          { 
            role: "user", 
            content: `PROFILE: ${JSON.stringify(clientProfile)}\nBLACKLIST: ${blacklist}\nLEADS: ${JSON.stringify(rawResults)}` 
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0
      });

      const auditData = JSON.parse(auditResponse.choices[0].message.content || "{}");
      approvedMissions = auditData.approved_missions || auditData.missions || [];
      console.log(`✅ [PHASE 2] L'Auditor ha approvato ${approvedMissions.length} missioni Sniper.`);

    } catch (error: any) {
      console.error("❌ [PHASE 2] Errore Auditor:", error.message);
      return 0;
    }

    // --- SALVATAGGIO FINALE ---
    return await this.saveMissions(userId, approvedMissions, mode);
  }

  /**
   * Salva le missioni approvate nel DB evitando i duplicati
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
              title: opp.title || "Flash Mission",
              company_name: opp.company_name || "N/A",
              description: opp.reason || opp.snippet || "Nessun dettaglio.",
              source_url: opp.source_url,
              reward_amount: this.parseSalary(opp.salary_raw),
              estimated_duration_hours: 1, // Focus Second Income Sniper
              status: 'pending',
              type: mode as any,
              platform: opp.platform || "Direct",
              match_score: opp.match_score || 85,
              created_at: new Date().toISOString() as any
            })
            .execute();
          count++;
        }
      } catch (err) {
        console.error("⚠️ Errore salvataggio missione:", err);
      }
    }
    console.log(`💾 Caccia completata. ${count} missioni aggiunte al database.`);
    return count;
  }

  /**
   * Pulisce i dati del salario per il DB
   */
  private parseSalary(val: any): number {
    if (typeof val === 'number') return val;
    if (!val) return 20; // Default Sniper Rate
    const cleaned = val.toString().replace(/[^0-9]/g, '');
    const num = parseInt(cleaned, 10);
    return isNaN(num) || num === 0 ? 20 : (num > 1000 ? Math.floor(num/2000) : num);
  }
}