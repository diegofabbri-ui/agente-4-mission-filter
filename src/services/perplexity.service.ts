import axios from 'axios';
import { db } from '../infra/db';
import { sql } from 'kysely'; 
import fs from 'fs';
import path from 'path';

// --- CONFIGURAZIONE FONTI ---
const FALLBACK_SOURCES = {
    gig_quick: ["upwork.com/jobs", "freelancer.com/projects", "reddit.com/r/forhire", "guru.com/d/jobs"],
    aggregators: ["remoteok.com", "nodesk.co", "remotive.com", "weworkremotely.com"],
    tech: ["gun.io", "wellfound.com/jobs", "stackoverflow.com/jobs"],
    creative: ["behance.net/joblist", "dribbble.com/jobs"],
    biz: ["marketerhire.com", "growth.org/jobs"]
};

let sourcesMasterlist: any = FALLBACK_SOURCES;

try {
    const pathsToTry = [
        path.join(process.cwd(), 'src', 'knowledge_base', 'sources_masterlist.json'),
        path.join(process.cwd(), 'dist', 'knowledge_base', 'sources_masterlist.json'),
        path.join(__dirname, '..', 'knowledge_base', 'sources_masterlist.json')
    ];
    for (const p of pathsToTry) {
        if (fs.existsSync(p)) {
            sourcesMasterlist = JSON.parse(fs.readFileSync(p, 'utf-8'));
            break;
        }
    }
} catch (e) { console.warn("⚠️ Masterlist non trovata. Uso Fallback."); }

export class PerplexityService {
  private apiKey: string;
  private kbPath: string;

  constructor() {
    this.apiKey = process.env.PERPLEXITY_API_KEY || '';
    const isProd = process.env.NODE_ENV === 'production';
    this.kbPath = isProd 
      ? path.join(process.cwd(), 'dist', 'knowledge_base')
      : path.join(process.cwd(), 'src', 'knowledge_base');
  }

  private loadTextFile(filename: string): string {
    try {
      const filePath = path.join(this.kbPath, filename);
      if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf-8');
      return "";
    } catch (e) { return ""; }
  }

  // ==================================================================================
  // 🔍 CORE: RICERCA "SMART" (Anti-Crash)
  // ==================================================================================
  public async findGrowthOpportunities(userId: string, clientProfile: any, mode: 'daily' | 'weekly' | 'monthly' = 'daily') {
    
    const recencyFilter = mode === 'daily' ? 'day' : 'week';
    console.log(`🚀 [HUNTER] Caccia ${mode.toUpperCase()} | Recency: ${recencyFilter}`);

    try {
        await this.performSearch(userId, clientProfile, mode, recencyFilter);
    } catch (error: any) {
        console.error(`⚠️ Errore Caccia (${mode}):`, error.message);
        
        // Retry automatico SOLO se non è un errore di timeout grave o autenticazione
        if (mode === 'daily' && !error.message.includes("401") && !error.message.includes("timeout")) {
            console.log("🔄 Tentativo Retry con filtro 'week'...");
            try {
                await this.performSearch(userId, clientProfile, mode, 'week');
            } catch (retryError) {
                console.error("❌ Retry fallito.");
            }
        }
    }
  }

  private async performSearch(userId: string, clientProfile: any, mode: string, recency: string) {
    let systemInstruction = "";
    if (mode === 'weekly') systemInstruction = this.loadTextFile('system_headhunter_weekly.md');
    else if (mode === 'monthly') systemInstruction = this.loadTextFile('system_headhunter_monthly.md');
    else systemInstruction = this.loadTextFile('system_headhunter_prompt.md');

    if (!systemInstruction) systemInstruction = "You are an expert headhunter. Find active freelance gigs.";

    const userRole = (clientProfile.dreamRole || "freelancer").toLowerCase();
    const userSkills = (clientProfile.keySkillsToAcquire || []).join(' ').toLowerCase();
    
    // Selezione Fonti (Limitata a 12 per evitare overload del prompt)
    const targetSites = this.getModeSpecificSources(mode, userRole + " " + userSkills).slice(0, 12);
    
    const searchContext = `
      ROLE: ${clientProfile.dreamRole}
      SKILLS: ${(clientProfile.keySkillsToAcquire || []).join(', ')}
      
      --- 🎯 SEARCH COMMAND ---
      Find 5 ACTIVE freelance/contract listings published in the last ${recency === 'day' ? '24 hours' : '7 days'}.
      
      **PRIORITY SOURCES:**
      ${targetSites.join(', ')}
      
      **STRICT EXCLUSIONS (DO NOT RETURN THESE):**
      - **"smartremotejobs.com"** (FAKE/BROKEN LINKS)
      - "indeed.com", "glassdoor.com", "linkedin.com" (BROKEN API LINKS)
      
      **CRITICAL FILTERS:**
      1. **URL CHECK:** Must be a direct job post.
      2. **NO EMPLOYEES:** Reject "W2", "Benefits", "Health Insurance".
      3. **FREELANCE ONLY:** Look for "Contract", "B2B", "Project", "Hourly".
    `;

    // FIX CRITICO: Timeout e Configurazione Axios per evitare hanging
    const response = await axios.post(
      'https://api.perplexity.ai/chat/completions',
      {
        model: 'sonar-pro', 
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: `${searchContext}\n\nOUTPUT: JSON Array ONLY. 5 Results. Valid Direct URLs.` }
        ],
        search_recency_filter: recency, 
        temperature: 0.15 
      },
      { 
          headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          timeout: 90000 // 90 Secondi Timeout (Previene blocco infinito)
      }
    );

    const rawContent = response.data.choices[0].message.content;
    
    if (!rawContent || rawContent.length < 50 || rawContent.includes("[]")) {
        throw new Error("Empty or Invalid Response from AI");
    }

    await this.processAndSaveOpportunities(rawContent, userId, mode as any);
  }

  private getModeSpecificSources(mode: string, roleAndSkills: string): string[] {
      const list = Object.keys(sourcesMasterlist).length > 0 ? sourcesMasterlist : FALLBACK_SOURCES;
      let sources: string[] = [];

      if (mode === 'daily') {
          sources.push(...(list.gig_quick || FALLBACK_SOURCES.gig_quick || []));
          sources.push(...(list.aggregators || [])); 
      } else {
          sources.push(...(list.aggregators_clean || list.aggregators || []));
          sources.push(...(list.gig_quick || []));
          
          if (this.matches(roleAndSkills, ['dev', 'code'])) sources.push(...(list.tech || []));
          if (this.matches(roleAndSkills, ['writ', 'content'])) sources.push(...(list.writing_content || []));
          if (this.matches(roleAndSkills, ['design', 'ui'])) sources.push(...(list.design_creative || []));
      }
      
      return [...new Set(sources)]
          .filter(s => !s.includes('smartremote') && !s.includes('indeed'))
          .sort(() => 0.5 - Math.random());
  }

  private matches(text: string, keywords: string[]): boolean {
      return keywords.some(k => text.includes(k));
  }

  // ==================================================================================
  // 💾 SALVATAGGIO SICURO
  // ==================================================================================
  private async processAndSaveOpportunities(rawJson: string, userId: string, type: 'daily' | 'weekly' | 'monthly') {
    try {
      let cleanContent = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      const firstBracket = cleanContent.indexOf('[');
      const lastBracket = cleanContent.lastIndexOf(']');
      
      if (firstBracket === -1 || lastBracket === -1) return;
      
      const missions = JSON.parse(cleanContent.substring(firstBracket, lastBracket + 1));
      let savedCount = 0;
      let estimatedHours = type === 'daily' ? 2 : (type === 'weekly' ? 8 : 40);
      let maxCommands = type === 'weekly' ? 100 : (type === 'monthly' ? 400 : 20);

      // Esecuzione in transazione per sicurezza
      await db.transaction().execute(async (trx) => {
          for (const m of missions) {
            const finalUrl = m.source_url || m.url || "#";
            
            if (this.isBrokenSource(finalUrl)) continue;

            const exists = await trx.selectFrom('missions').select('id').where('source_url', '=', finalUrl).executeTakeFirst();

            if (!exists) {
                const newMission = await trx.insertInto('missions')
                  .values({
                    user_id: userId,
                    title: m.title || "Opportunità Freelance",
                    description: m.description || "Dettagli nel link.",
                    source_url: finalUrl,
                    source: this.detectPlatform(finalUrl),
                    reward_amount: this.parseReward(m.payout_estimation || m.budget),
                    estimated_duration_hours: estimatedHours,
                    status: 'pending',
                    type: type,
                    max_commands: maxCommands,
                    conversation_history: JSON.stringify([]),
                    platform: this.detectPlatform(finalUrl),
                    company_name: m.company_name || "Confidenziale",
                    match_score: m.match_score || 85,
                    raw_data: JSON.stringify({ tasks_breakdown: m.tasks_breakdown || [] }),
                    analysis_notes: m.analysis_notes || `Auto-detected`
                  })
                  .returning('id')
                  .executeTakeFirst();

                if (newMission && newMission.id) {
                    await trx.insertInto('mission_threads')
                        .values({
                            mission_id: newMission.id,
                            user_id: userId,
                            role: 'system',
                            content: `Nuova Missione (${type}) rilevata: ${m.title}. Fonte: ${this.detectPlatform(finalUrl)}`,
                            created_at: new Date()
                        })
                        .execute();
                    
                    savedCount++;
                }
            }
          }
      });
      console.log(`✅ [DB] Salvataggio completato: ${savedCount} nuove missioni (${type}).`);
    } catch (e) { console.error("❌ Errore Elaborazione JSON/DB:", e); }
  }

  private isBrokenSource(url: string): boolean {
      if (!url || url.length < 10) return true;
      const lower = url.toLowerCase();
      const brokenDomains = ['smartremotejobs', 'indeed.com', 'glassdoor.com', 'google.com/search', 'login', 'signup'];
      return brokenDomains.some(bad => lower.includes(bad));
  }

  private detectPlatform(url: string): string {
      try { return new URL(url).hostname.replace('www.', '').split('.')[0]; } 
      catch (e) { return 'Web'; }
  }

  private parseReward(rewardString: string | number): number {
    if (typeof rewardString === 'number') return rewardString;
    if (!rewardString) return 10;
    const clean = rewardString.toString().replace(/[^0-9.]/g, '');
    return parseFloat(clean) || 10;
  }
}