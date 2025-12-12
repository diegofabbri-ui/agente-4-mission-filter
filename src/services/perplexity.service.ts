import axios from 'axios';
import { db } from '../infra/db';
import { sql } from 'kysely'; 
import fs from 'fs';
import path from 'path';

// --- CONFIGURAZIONE FONTI (GUIDA PER L'AI, NON BLOCCO RIGIDO) ---
const FALLBACK_SOURCES = {
    aggregators: ["remoteok.com", "weworkremotely.com", "nodesk.co", "remotive.com", "workingnomads.com"],
    freelance: ["upwork.com/jobs", "freelancer.com/projects", "guru.com/d/jobs"],
    tech: ["gun.io", "toptal.com", "ycombinator.com/jobs", "wellfound.com/jobs", "stackoverflow.com/jobs"],
    creative: ["behance.net/joblist", "dribbble.com/jobs", "designjobs.board"],
    biz: ["marketerhire.com", "growth.org/jobs", "exitfive.com/jobs"]
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
  // 🔍 CORE: RICERCA "SMART FILTER" (Blacklist instead of Whitelist)
  // ==================================================================================
  public async findGrowthOpportunities(userId: string, clientProfile: any, mode: 'daily' | 'weekly' | 'monthly' = 'daily') {
    
    // 1. TENTATIVO PRINCIPALE (Recency Stretta)
    const recencyFilter = mode === 'daily' ? 'day' : 'week';
    console.log(`🚀 [HUNTER] Caccia ${mode.toUpperCase()} | Recency: ${recencyFilter}`);

    try {
        await this.performSearch(userId, clientProfile, mode, recencyFilter);
    } catch (error) {
        console.warn("⚠️ Prima ricerca fallita o 0 risultati. Riprovo con finestra più ampia...");
        // 2. RETRY AUTOMATICO (Recency Estesa se fallisce)
        if (mode === 'daily') {
            await this.performSearch(userId, clientProfile, mode, 'week');
        }
    }
  }

  private async performSearch(userId: string, clientProfile: any, mode: string, recency: string) {
    let systemInstruction = "";
    if (mode === 'weekly') systemInstruction = this.loadTextFile('system_headhunter_weekly.md');
    else if (mode === 'monthly') systemInstruction = this.loadTextFile('system_headhunter_monthly.md');
    else systemInstruction = this.loadTextFile('system_headhunter_prompt.md');

    if (!systemInstruction) systemInstruction = "You are an expert headhunter. Find active freelance jobs.";

    const userRole = (clientProfile.dreamRole || "freelancer").toLowerCase();
    const userSkills = (clientProfile.keySkillsToAcquire || []).join(' ').toLowerCase();
    const targetSites = this.getRelevantSources(userRole + " " + userSkills).slice(0, 15);
    
    const searchContext = `
      ROLE: ${clientProfile.dreamRole}
      SKILLS: ${(clientProfile.keySkillsToAcquire || []).join(', ')}
      
      --- 🎯 SEARCH COMMAND ---
      Find 5 ACTIVE freelance/contract listings published in the last ${recency === 'day' ? '24 hours' : '7 days'}.
      
      **PRIORITY SOURCES:**
      ${targetSites.join(', ')}
      
      **STRICT EXCLUSIONS (DO NOT RETURN THESE):**
      - **"smartremotejobs.com"** (FAKE/BROKEN LINKS)
      - "indeed.com", "glassdoor.com" (BROKEN API LINKS)
      - "linkedin.com/jobs" (LOGIN WALL)
      
      **CRITICAL FILTERS:**
      1. **URL CHECK:** Must be a direct job post (contains /job/, /project/, /careers/).
      2. **NO EMPLOYEES:** Reject "W2", "Benefits", "Health Insurance".
      3. **FREELANCE ONLY:** Look for "Contract", "B2B", "Project", "Hourly".
    `;

    const response = await axios.post(
      'https://api.perplexity.ai/chat/completions',
      {
        model: 'sonar-pro', 
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: `${searchContext}\n\nOUTPUT: JSON Array ONLY. 5 Results. Valid Direct URLs.` }
        ],
        search_recency_filter: recency, 
        temperature: 0.1 
      },
      { headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' } }
    );

    const rawContent = response.data.choices[0].message.content;
    
    // Check veloce: se la risposta è vuota o corta, lancia errore per attivare il Retry
    if (!rawContent || rawContent.length < 50) throw new Error("Empty Response");

    await this.processAndSaveOpportunities(rawContent, userId, mode as any);
  }

  private getRelevantSources(roleAndSkills: string): string[] {
      const list = Object.keys(sourcesMasterlist).length > 0 ? sourcesMasterlist : FALLBACK_SOURCES;
      const cleanList = (arr: string[]) => (arr || []).filter(s => !s.includes('smartremote') && !s.includes('indeed'));

      const aggregators = cleanList(list.aggregators || list.aggregators_clean || []);
      const general = cleanList(list.general_remote || list.general_freelance || []);
      let sources = [...aggregators, ...general];

      if (this.matches(roleAndSkills, ['dev', 'code', 'tech'])) sources.push(...cleanList(list.tech_dev));
      if (this.matches(roleAndSkills, ['writ', 'content'])) sources.push(...cleanList(list.writing_content));
      if (this.matches(roleAndSkills, ['design', 'ui'])) sources.push(...cleanList(list.design_creative));
      
      return [...new Set(sources)].sort(() => 0.5 - Math.random());
  }

  private matches(text: string, keywords: string[]): boolean {
      return keywords.some(k => text.includes(k));
  }

  // ==================================================================================
  // 💾 SALVATAGGIO (Con Blacklist Check invece di Whitelist)
  // ==================================================================================
  private async processAndSaveOpportunities(rawJson: string, userId: string, type: 'daily' | 'weekly' | 'monthly') {
    try {
      let cleanContent = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      const firstBracket = cleanContent.indexOf('[');
      const lastBracket = cleanContent.lastIndexOf(']');
      
      if (firstBracket === -1 || lastBracket === -1) return; // Non salvare nulla ma non bloccare
      const missions = JSON.parse(cleanContent.substring(firstBracket, lastBracket + 1));
      
      let savedCount = 0;
      let estimatedHours = type === 'daily' ? 2 : (type === 'weekly' ? 8 : 40);
      let maxCommands = type === 'weekly' ? 100 : (type === 'monthly' ? 400 : 20);

      await db.transaction().execute(async (trx) => {
          for (const m of missions) {
            const finalUrl = m.source_url || m.url || "#";
            
            // --- BLACKLIST FILTER (Sblocca tutto tranne i siti rotti) ---
            if (this.isBrokenSource(finalUrl)) {
                console.log(`[BLOCKED SOURCE] ${finalUrl}`);
                continue;
            }

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

                    try {
                        await sql`
                            UPDATE mission_filters 
                            SET match_count = match_count + 1, last_match_at = NOW() 
                            WHERE user_id = ${userId} AND is_active = true
                        `.execute(trx);
                    } catch (e) {}
                    
                    savedCount++;
                }
            }
          }
      });
      console.log(`✅ Saved ${savedCount} valid missions.`);
    } catch (e) { console.error("❌ Processing Error:", e); }
  }

  // --- UTILS: BLACKLIST INTELLIGENTE ---
  private isBrokenSource(url: string): boolean {
      if (!url || url.length < 10) return true;
      const lower = url.toLowerCase();

      // LISTA NERA: Siti che danno 404, richiedono login o sono aggregatori fake
      const brokenDomains = [
          'smartremotejobs', // IL COLPEVOLE PRINCIPALE
          'indeed.com',      // Link temporanei
          'glassdoor.com',   // Login wall
          'google.com/search', // Pagina generica
          'linkedin.com/jobs/search', // Pagina generica
          'login', 'signup', 'signin' // Pagine di auth
      ];

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