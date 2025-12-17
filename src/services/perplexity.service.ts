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
    // Gestione percorsi per trovare i file in dist (prod) o src (dev)
    this.kbPath = isProd 
      ? path.join(process.cwd(), 'dist', 'knowledge_base')
      : path.join(process.cwd(), 'src', 'knowledge_base');
  }

  /**
   * Helper per caricare i file markdown e json dalla Knowledge Base
   */
  private loadKBFile(filename: string): string {
    try {
      const pathsToTry = [
        path.join(this.kbPath, filename),
        path.join(this.kbPath, 'developer', filename),
        path.join(this.kbPath, 'guardrails', filename),
        path.join(process.cwd(), 'src', 'knowledge_base', filename)
      ];
      for (const p of pathsToTry) {
        if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8');
      }
      return "";
    } catch (e) { return ""; }
  }

  /**
   * 1. FASE HUNTER: Generazione Query SEO Dinamica
   * Usa search_operators_masterclass e dynamic_seo_logic
   */
  private generateSearchQuery(profile: any, mode: string): string {
    const seoLogic = this.loadKBFile('dynamic_seo_logic.md');
    const operators = this.loadKBFile('search_operators_masterclass.md');
    
    const role = profile.dreamRole || "Remote Professional";
    const timeframe = mode === 'daily' ? 'past 24 hours' : 'past week';

    // Iniezione degli operatori di ricerca professionali
    return `
      MANIFIESTO UTENTE: ${role}
      TIMEFRAME: ${timeframe}
      
      REGOLE SEO (CONTEXT):
      ${seoLogic}
      ${operators}

      TASK: Trova 10-15 opportunità di lavoro remoto/freelance.
      FOCUS: Task brevi (30-60 min), urgenza alta, link diretti.
      OUTPUT: Restituisci un JSON Array grezzo con titolo, azienda, url e descrizione breve.
    `;
  }

  /**
   * --- CORE ALGORITHM ---
   */
  public async findGrowthOpportunities(userId: string, clientProfile: any, mode: 'daily' | 'weekly' | 'monthly' = 'daily'): Promise<number> {
    console.log(`\n🚀 [ALGORITMO SNIPER] Avvio Caccia ${mode.toUpperCase()} per User: ${userId}`);

    // --- FASE 1: THE HUNTER (Perplexity Sonar) ---
    // Obiettivo: Recuperare il massimo volume possibile di dati grezzi.
    const hunterPrompt = this.loadKBFile('system_headhunter_prompt.md');
    const searchQuery = this.generateSearchQuery(clientProfile, mode);

    let rawResults = [];
    try {
      console.log("🔍 [PHASE 1] Hunter fetch in corso...");
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
      const jsonMatch = content.match(/\[.*\]/s);
      rawResults = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      console.log(`📥 [PHASE 1] Recuperate ${rawResults.length} potenziali tracce.`);
    } catch (error: any) {
      console.error("❌ Errore Fase Hunter:", error.message);
      return 0;
    }

    if (rawResults.length === 0) return 0;

    // --- FASE 2: THE AUDITOR (OpenAI Guardrail A3-A) ---
    // Obiettivo: Pulizia, applicazione Blacklist e Sniper Protocol.
    const auditorPrompt = this.loadKBFile('system_headhunter_daily_reviewer.md');
    const blacklist = this.loadKBFile('global_blacklist.json');
    const sniperProtocol = this.loadKBFile('manual_a_sniper_protocol.md');

    let approvedMissions = [];
    try {
      console.log("🛡️ [PHASE 2] Guardrail Auditor in corso...");
      const auditResponse = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: auditorPrompt },
          { role: "user", content: `
            SNIPER PROTOCOL: ${sniperProtocol}
            BLACKLIST: ${blacklist}
            
            LEADS TO AUDIT: 
            ${JSON.stringify(rawResults)}
          `}
        ],
        response_format: { type: "json_object" },
        temperature: 0
      });

      const auditData = JSON.parse(auditResponse.choices[0].message.content || "{}");
      approvedMissions = auditData.approved_missions || [];
      console.log(`✅ [PHASE 2] Approvate ${approvedMissions.length} missioni dopo lo Sniper Filter.`);
    } catch (error: any) {
      console.error("❌ Errore Fase Auditor:", error.message);
      // Fallback: se l'auditor crasha, non salviamo dati sporchi per evitare spam.
      return 0;
    }

    // --- SALVATAGGIO FINALE ---
    return await this.saveMissions(userId, approvedMissions, mode);
  }

  /**
   * Parser e salvataggio su database
   */
  private async saveMissions(userId: string, opportunities: any[], mode: string): Promise<number> {
    let count = 0;
    for (const opp of opportunities) {
      // Evitiamo duplicati
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
            title: opp.title,
            company_name: opp.company_name || "N/A",
            description: `${opp.reason}\n\n${opp.snippet || ''}`,
            source_url: opp.source_url,
            reward_amount: this.parseMoney(opp.reward_amount),
            estimated_duration_hours: opp.estimated_hours || 1,
            status: 'pending',
            type: mode as any,
            platform: opp.platform || "AI Sniper",
            match_score: opp.match_score || 85,
            created_at: new Date().toISOString() as any
          })
          .execute();
        count++;
      }
    }
    console.log(`💾 Salvataggio completato: ${count} nuove missioni.`);
    return count;
  }

  /**
   * Converte stringhe di compenso in numeri puliti
   */
  private parseMoney(val: any): number {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const str = val.toString().replace(/[^0-9]/g, '');
    const num = parseInt(str, 10);
    // Se è un valore annuale alto (es 80000), calcoliamo una stima oraria
    if (num > 1000) return Math.floor(num / 2000); 
    return num || 0;
  }
}