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
    
    // Gestione percorsi per ambiente locale (src) e produzione (dist)
    const isProd = process.env.NODE_ENV === 'production' || __dirname.includes('dist');
    this.kbPath = isProd 
      ? path.join(process.cwd(), 'dist', 'knowledge_base')
      : path.join(process.cwd(), 'src', 'knowledge_base');
  }

  /**
   * Carica i file di testo con fallback su diversi percorsi
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
   * Genera la query di ricerca per Perplexity
   */
  private generateSearchQuery(role: string, mode: string): string {
    const timeframe = mode === 'daily' ? 'last 24 hours' : 'last 7 days';
    return `Find 15 remote freelance or contract job postings for "${role}" published in the ${timeframe}. 
    Exclude full-time roles. Provide direct application URLs.`;
  }

  /**
   * CORE: Hunter (Perplexity) + Auditor (OpenAI)
   */
  public async findGrowthOpportunities(
    userId: string, 
    clientProfile: any, 
    mode: 'daily' | 'weekly' | 'monthly' = 'daily'
  ): Promise<number> {
    console.log(`\n🕵️‍♂️ [SNIPER ENGINE] Avvio sessione ${mode.toUpperCase()} - User: ${userId}`);

    // 1. Estrazione Ruolo dal Profilo (con fallback)
    const role = clientProfile.dreamRole || clientProfile.role || "Freelance Professional";
    
    // 2. Caricamento e COMPILAZIONE del Prompt
    let hunterPrompt = this.loadKBFile('system_headhunter_prompt.md');
    
    // 🔥 FIX CRUCIALE: Sostituzione dei segnaposto nel file Markdown
    hunterPrompt = hunterPrompt
      .replace(/{DREAM_ROLE_KEYWORD}/g, role)
      .replace(/{ROLE}/g, role);

    const searchQuery = this.generateSearchQuery(role, mode);

    console.log(`📡 [DEBUG] Ruolo iniettato: **${role}**`);

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
        { headers: { 'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}` } }
      );

      const content = response.data.choices[0].message.content;
      
      // Estrazione dell'array JSON dalla risposta
      const jsonMatch = content.match(/\[.*\]/s);
      rawResults = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      
      console.log(`📊 [PHASE 1] Trovate ${rawResults.length} potenziali tracce.`);
    } catch (error: any) {
      console.error("❌ [PHASE 1] Errore Hunter:", error.message);
      return 0;
    }

    if (rawResults.length === 0) return 0;

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
            content: auditorPrompt || "Review these jobs and pick the best micro-tasks. Return JSON." 
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
      console.log(`✅ [PHASE 2] Approvate ${approvedMissions.length} missioni Sniper.`);
    } catch (error: any) {
      console.error("❌ [PHASE 2] Errore Auditor:", error.message);
      return 0;
    }

    return await this.saveMissions(userId, approvedMissions, mode);
  }

  /**
   * Salvataggio a DB con prevenzione duplicati
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
              title: opp.title || "Mission",
              company_name: opp.company_name || "N/A",
              description: opp.reason || opp.snippet || "Nessuna descrizione.",
              source_url: opp.source_url,
              reward_amount: this.cleanSalary(opp.salary_raw),
              estimated_duration_hours: 1,
              status: 'pending',
              type: mode as any,
              platform: opp.platform || "Web",
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
    return count;
  }

  private cleanSalary(val: any): number {
    if (typeof val === 'number') return val;
    if (!val) return 25;
    const num = parseInt(val.toString().replace(/[^0-9]/g, ''), 10);
    return isNaN(num) || num === 0 ? 25 : (num > 1000 ? Math.floor(num/2000) : num);
  }
}