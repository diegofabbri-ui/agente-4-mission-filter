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
    
    // Gestione percorsi cross-platform (Dev vs Prod su Railway/Aruba)
    const isProd = process.env.NODE_ENV === 'production' || __dirname.includes('dist');
    this.kbPath = isProd 
      ? path.join(process.cwd(), 'dist', 'knowledge_base')
      : path.join(process.cwd(), 'src', 'knowledge_base');
  }

  /**
   * Caricamento file KB con fallback
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
   * Genera la query di ricerca ottimizzata per "Assistente Virtuale / Freelance"
   */
  private generateSearchQuery(role: string, mode: string): string {
    const timeframe = mode === 'daily' ? 'last 24 hours' : 'last 7 days';
    return `Find 15 remote freelance, contract, or part-time job postings for "${role}" published in the ${timeframe}. 
    Exclude full-time permanent roles. Focus on immediate needs or project-based tasks. 
    Ensure results include a direct URL to the job post.`;
  }

  /**
   * CORE: Hunter (Perplexity) + Auditor (OpenAI)
   */
  public async findGrowthOpportunities(
    userId: string, 
    clientProfile: any, 
    mode: 'daily' | 'weekly' | 'monthly' = 'daily'
  ): Promise<number> {
    console.log(`\n🕵️‍♂️ [SNIPER ENGINE] Inizio elaborazione ${mode.toUpperCase()} - User: ${userId}`);

    // 1. Estrazione Ruolo dal profilo utente
    const role = clientProfile.dreamRole || clientProfile.role || "Assistente Virtuale";
    
    // 2. Caricamento e Compilazione del Prompt Hunter
    let hunterPrompt = this.loadKBFile('system_headhunter_prompt.md');
    hunterPrompt = hunterPrompt
      .replace(/{DREAM_ROLE_KEYWORD}/g, role)
      .replace(/{ROLE}/g, role);

    const searchQuery = this.generateSearchQuery(role, mode);

    console.log(`📡 [DEBUG] Ruolo iniettato con successo: **${role}**`);

    // --- FASE 1: THE HUNTER (Perplexity) ---
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
          temperature: 0.2
        },
        { 
          headers: { 'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}` },
          timeout: 45000 // ⏱️ Timeout 45s per evitare il "freeze" del container
        }
      );

      const content = response.data.choices[0]?.message?.content;
      if (!content) throw new Error("Risposta API vuota");

      const jsonMatch = content.match(/\[.*\]/s);
      rawResults = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      
      console.log(`📊 [PHASE 1] Il Cacciatore ha trovato ${rawResults.length} potenziali tracce.`);
    } catch (error: any) {
      if (error.code === 'ECONNABORTED') {
        console.error("❌ [PHASE 1] TIMEOUT: L'API Perplexity è stata troppo lenta.");
      } else {
        console.error("❌ [PHASE 1] Errore critico Hunter:", error.message);
      }
      return 0; // Esci senza crashare
    }

    if (rawResults.length === 0) {
      console.log("⚠️ [PHASE 1] Nessuna traccia trovata. Caccia sospesa.");
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
            content: auditorPrompt || "You are an expert auditor. Select only freelance/contract tasks. Return JSON." 
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
      approvedMissions = auditData.approved_missions || auditData.missions || [];
      console.log(`✅ [PHASE 2] L'Auditor ha approvato ${approvedMissions.length} missioni.`);
    } catch (error: any) {
      console.error("❌ [PHASE 2] Errore Auditor:", error.message);
      return 0;
    }

    // --- SALVATAGGIO ---
    return await this.saveMissions(userId, approvedMissions, mode);
  }

  /**
   * Salvataggio nel database con prevenzione duplicati
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
              title: opp.title || "Missione Sniper",
              company_name: opp.company_name || "N/A",
              description: opp.reason || opp.snippet || "Nessun dettaglio extra.",
              source_url: opp.source_url,
              reward_amount: this.parseReward(opp.salary_raw),
              estimated_duration_hours: 1,
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
    console.log(`💾 Ciclo completato. ${count} nuove missioni salvate nel database.`);
    return count;
  }

  /**
   * Pulisce i dati del compenso
   */
  private parseReward(val: any): number {
    if (typeof val === 'number') return val;
    if (!val) return 25;
    const num = parseInt(val.toString().replace(/[^0-9]/g, ''), 10);
    return isNaN(num) || num === 0 ? 25 : (num > 1000 ? Math.floor(num/2000) : num);
  }
}