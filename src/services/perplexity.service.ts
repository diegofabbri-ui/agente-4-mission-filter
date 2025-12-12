import axios from 'axios';
import { db } from '../infra/db';
import { sql } from 'kysely'; 
import fs from 'fs';
import path from 'path';

// --- CONFIGURAZIONE FONTI (FALLBACK) ---
// Rimossi siti problematici dalle liste di default
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
  // 🔍 CORE: RICERCA "SMART & STABLE"
  // ==================================================================================
  public async findGrowthOpportunities(userId: string, clientProfile: any, mode: 'daily' | 'weekly' | 'monthly' = 'daily') {
    
    // Recency: 'day' per Daily, 'week' per gli altri
    const recencyFilter = mode === 'daily' ? 'day' : 'week';
    console.log(`🚀 [HUNTER] Caccia ${mode.toUpperCase()} | Recency: ${recencyFilter}`);

    try {
        await this.performSearch(userId, clientProfile, mode, recencyFilter);
    } catch (error: any) {
        console.error(`⚠️ Errore Caccia (${mode}):`, error.message);
        
        // Retry automatico solo se non è un errore fatale
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
    
    // Selezione Fonti (Max 15 per non confondere l'AI)
    const targetSites = this.getModeSpecificSources(mode, userRole + " " + userSkills).slice(0, 15);
    
    // Prompt Semplificato (Stile "Vecchio File" ma con protezioni)
    // Meno vincoli negativi nel testo = Più risultati trovati.
    // Il filtraggio "cattivo" lo facciamo noi dopo con 'isBrokenSource'.
    const searchContext = `
      ROLE: ${clientProfile.dreamRole}
      SKILLS: ${(clientProfile.keySkillsToAcquire || []).join(', ')}
      
      --- 🎯 SEARCH MISSION ---
      Find 5 FRESH & ACTIVE freelance/contract opportunities published in the last ${recency === 'day' ? '24 hours' : '7 days'}.
      
      **LOOK HERE (PRIORITY):**
      ${targetSites.join(', ')}
      
      **RULES:**
      1. **LINK MUST WORK:** Verify the URL is a specific job post (not a search page).
      2. **NO CORPORATE BS:** Ignore jobs with "Benefits", "401k", "On-site". We want Freelance/Contract.
      3. **EXCLUDE:** Do NOT use "smartremotejobs", "peopleperhour", "indeed".
    `;

    const response = await axios.post(
      'https://api.perplexity.ai/chat/completions',
      {
        model: 'sonar-pro', 
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: `${searchContext}\n\nOUTPUT: JSON Array ONLY. Valid URLs.` }
        ],
        search_recency_filter: recency, 
        temperature: 0.15 
      },
      { 
          // Timeout esteso a 90s per evitare crash su ricerche lente
          headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          timeout: 90000 
      }
    );

    const rawContent = response.data.choices[0].message.content;
    
    if (!rawContent || rawContent.length < 50 || rawContent.includes("[]")) {
        throw new Error("Empty Response from AI");
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
      
      // FILTRO PREVENTIVO SITI BANNATI
      return [...new Set(sources)]
          .filter(s => !s.includes('smartremote') && !s.includes('indeed') && !s.includes('peopleperhour'))
          .sort(() => 0.5 - Math.random());
  }

  private matches(text: string, keywords: string[]): boolean {
      return keywords.some(k => text.includes(k));
  }

  // ==================================================================================
  // 💾 SALVATAGGIO CON FILTRO BLACKLIST
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
            
            // IL GUARDIANO: Blocca qui i siti rotti
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
                    
                    savedCount++;
                }
            }
          }
      });
      console.log(`✅ [DB] Salvataggio completato: ${savedCount} nuove missioni (${type}).`);
    } catch (e) { console.error("❌ Errore Elaborazione JSON/DB:", e); }
  }

  // --- UTILS: BLACKLIST AGGIORNATA ---
  private isBrokenSource(url: string): boolean {
      if (!url || url.length < 10) return true;
      const lower = url.toLowerCase();

      // LISTA NERA UFFICIALE
      const brokenDomains = [
          'smartremotejobs',  // Bannato (truffa/rotto)
          'peopleperhour',    // BANNATO ORA (link 404)
          'indeed.com',       // Link temporanei non validi
          'glassdoor.com',    // Login wall
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