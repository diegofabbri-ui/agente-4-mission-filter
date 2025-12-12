import axios from 'axios';
import { db } from '../infra/db';
import { sql } from 'kysely'; 
import fs from 'fs';
import path from 'path';

// --- CONFIGURAZIONE FONTI (GUIDA) ---
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
  // 🔍 CORE: RICERCA IBRIDA (Daily=Gig | Weekly/Monthly=Contract)
  // ==================================================================================
  public async findGrowthOpportunities(userId: string, clientProfile: any, mode: 'daily' | 'weekly' | 'monthly' = 'daily') {
    
    // Recency: 'day' per Daily, 'week' per gli altri
    const recencyFilter = mode === 'daily' ? 'day' : 'week';
    console.log(`🚀 [HUNTER] Caccia ${mode.toUpperCase()} | Recency: ${recencyFilter}`);

    try {
        await this.performSearch(userId, clientProfile, mode, recencyFilter);
    } catch (error) {
        console.warn("⚠️ Ricerca vuota. Tentativo di fallback...");
        // Retry automatico solo se strettamente necessario
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

    if (!systemInstruction) systemInstruction = "You are an expert headhunter.";

    const userRole = (clientProfile.dreamRole || "freelancer").toLowerCase();
    const userSkills = (clientProfile.keySkillsToAcquire || []).join(' ').toLowerCase();
    const targetSites = this.getModeSpecificSources(mode, userRole + " " + userSkills).slice(0, 15);
    
    // --- QUERY BUILDER DINAMICO ---
    let searchContext = "";

    if (mode === 'daily') {
        // [DAILY] MANTENUTA INTATTA (Funziona bene)
        searchContext = `
          ROLE: ${clientProfile.dreamRole}
          SKILLS: ${(clientProfile.keySkillsToAcquire || []).join(', ')}
          
          --- 🎯 DAILY GIG SEARCH ---
          Find 5 ACTIVE micro-tasks (< 2h effort) posted in the last 24 hours.
          SOURCES: ${targetSites.join(', ')}
          EXCLUDE: "smartremotejobs", "indeed", "linkedin", "glassdoor".
          FILTERS: Must be "Quick fix", "Task", "Hourly". NO W2/Benefits.
        `;
    } else {
        // [WEEKLY/MONTHLY] OTTIMIZZATA PER TROVARE CONTRATTI (NON LAVORI FISSI)
        // Qui permettiamo termini come "Contract" o "Retainer" che potrebbero sembrare jobs, 
        // ma filtriamo via i benefici da dipendente.
        searchContext = `
          ROLE: ${clientProfile.dreamRole}
          SKILLS: ${(clientProfile.keySkillsToAcquire || []).join(', ')}
          
          --- 🎯 CONTRACT/PROJECT SEARCH (${mode.toUpperCase()}) ---
          Find 5 ACTIVE **Contract** or **Freelance** listings posted in the last 7 days.
          
          **PRIORITY SOURCES:**
          ${targetSites.join(', ')}
          
          **EXCLUSIONS:**
          - **BANNED SITES:** "smartremotejobs", "indeed", "glassdoor".
          - **BANNED TERMS:** "Health Insurance", "401k matching", "Paid Time Off".
          
          **TARGET:**
          - Look for: "Contractor", "Freelance", "Project-based", "B2B Contract".
          - Scope: ${mode === 'weekly' ? 'Short-term Project (~10h)' : 'Long-term Contract/Retainer (~40h total)'}.
        `;
    }

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
      { headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' } }
    );

    const rawContent = response.data.choices[0].message.content;
    if (!rawContent || rawContent.length < 50 || rawContent.includes("[]")) throw new Error("Empty Response");

    await this.processAndSaveOpportunities(rawContent, userId, mode as any);
  }

  private getModeSpecificSources(mode: string, roleAndSkills: string): string[] {
      const list = Object.keys(sourcesMasterlist).length > 0 ? sourcesMasterlist : FALLBACK_SOURCES;
      let sources: string[] = [];

      if (mode === 'daily') {
          // DAILY: Solo Gig veloci
          sources.push(...(list.gig_quick || FALLBACK_SOURCES.gig_quick || []));
          sources.push(...(list.aggregators || [])); 
      } else {
          // WEEKLY/MONTHLY: Aggregatori + Verticali
          sources.push(...(list.aggregators_clean || list.aggregators || []));
          sources.push(...(list.gig_quick || [])); // Anche Upwork ha contratti lunghi
          
          if (this.matches(roleAndSkills, ['dev', 'code'])) sources.push(...(list.tech_dev || list.tech || []));
          if (this.matches(roleAndSkills, ['writ', 'content'])) sources.push(...(list.writing_content || []));
          if (this.matches(roleAndSkills, ['design', 'ui'])) sources.push(...(list.design_creative || []));
      }
      
      // RIMUOVIAMO SITI BANNATI DALLA LISTA SORGENTI
      return [...new Set(sources)]
          .filter(s => !s.includes('smartremote') && !s.includes('indeed'))
          .sort(() => 0.5 - Math.random());
  }

  private matches(text: string, keywords: string[]): boolean {
      return keywords.some(k => text.includes(k));
  }

  // ==================================================================================
  // 💾 SALVATAGGIO
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

      await db.transaction().execute(async (trx) => {
          for (const m of missions) {
            const finalUrl = m.source_url || m.url || "#";
            
            // --- BLACKLIST FILTER ---
            if (this.isBrokenSource(finalUrl)) {
                // console.log(`[BLOCKED SOURCE] ${finalUrl}`);
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

      // BANNED: smartremotejobs (richiesto da utente), indeed (rotto), glassdoor (login)
      const brokenDomains = [
          'smartremotejobs', 
          'indeed.com',      
          'glassdoor.com',   
          'google.com/search', 
          'linkedin.com/jobs/search',
          'login', 'signup', 'signin'
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