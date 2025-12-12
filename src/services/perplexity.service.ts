import axios from 'axios';
import { db } from '../infra/db';
import { sql } from 'kysely'; 
import fs from 'fs';
import path from 'path';

// --- CONFIGURAZIONE FONTI (PRIORITÀ UPWORK) ---
const FALLBACK_SOURCES = {
    // Upwork e Freelancer sono le fonti più affidabili (Link validi, no 404)
    gig_quick: ["upwork.com/jobs", "freelancer.com/projects", "guru.com/d/jobs"],
    // Aggregatori (Utili ma rischiosi per link rotti)
    aggregators: ["remoteok.com", "nodesk.co", "weworkremotely.com", "remotive.com"],
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
  // 🔍 CORE: RICERCA "RESCUE MODE"
  // ==================================================================================
  public async findGrowthOpportunities(userId: string, clientProfile: any, mode: 'daily' | 'weekly' | 'monthly' = 'daily') {
    
    const recencyFilter = mode === 'daily' ? 'day' : 'week';
    console.log(`🚀 [HUNTER] Caccia ${mode.toUpperCase()} | Recency: ${recencyFilter}`);

    try {
        // TENTATIVO 1: Ricerca Standard
        const count = await this.performSearch(userId, clientProfile, mode, recencyFilter);
        
        // TENTATIVO 2 (RESCUE): Se troviamo 0 risultati validi (tutti filtrati), riproviamo su Upwork
        if (count === 0) {
            console.warn(`⚠️ Caccia ${mode} ha prodotto 0 risultati validi. Avvio RESCUE su Upwork...`);
            // Forziamo la ricerca su fonti sicure (Gig Quick) anche se è Monthly
            await this.performSearch(userId, clientProfile, mode, 'week', true);
        }

    } catch (error: any) {
        console.error(`⚠️ Errore Critico Caccia (${mode}):`, error.message);
    }
  }

  private async performSearch(userId: string, clientProfile: any, mode: string, recency: string, forceRescue: boolean = false): Promise<number> {
    let systemInstruction = "";
    if (mode === 'weekly') systemInstruction = this.loadTextFile('system_headhunter_weekly.md');
    else if (mode === 'monthly') systemInstruction = this.loadTextFile('system_headhunter_monthly.md');
    else systemInstruction = this.loadTextFile('system_headhunter_prompt.md');

    if (!systemInstruction) systemInstruction = "You are an expert headhunter. Find active freelance gigs.";

    const userRole = (clientProfile.dreamRole || "freelancer").toLowerCase();
    const userSkills = (clientProfile.keySkillsToAcquire || []).join(' ').toLowerCase();
    
    // SELEZIONE FONTI
    let targetSites: string[] = [];
    if (forceRescue) {
        // In Rescue Mode usiamo SOLO Upwork/Freelancer perché sappiamo che funzionano
        targetSites = ["upwork.com/jobs", "freelancer.com/projects", "guru.com/d/jobs"];
    } else {
        // Normal Mode: Mix intelligente
        targetSites = this.getModeSpecificSources(mode, userRole + " " + userSkills).slice(0, 15);
    }
    
    const searchContext = `
      ROLE: ${clientProfile.dreamRole}
      SKILLS: ${(clientProfile.keySkillsToAcquire || []).join(', ')}
      
      --- 🎯 SEARCH MISSION ---
      Find 5 FRESH & ACTIVE freelance/contract opportunities published in the last ${recency === 'day' ? '24 hours' : '7 days'}.
      
      **MANDATORY SOURCES:**
      ${targetSites.join(', ')}
      
      **RULES:**
      1. **VALID LINKS ONLY:** Must be a direct job post (e.g., upwork.com/jobs/...). NO generic search pages.
      2. **NO CORPORATE:** Ignore "Benefits", "401k", "On-site". We want Freelance/Contract.
      3. **EXCLUDE:** Do NOT use "smartremotejobs", "peopleperhour", "indeed", "glassdoor".
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
          headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          timeout: 90000 
      }
    );

    const rawContent = response.data.choices[0].message.content;
    
    if (!rawContent || rawContent.length < 50 || rawContent.includes("[]")) {
        console.warn("⚠️ AI ha restituito lista vuota.");
        return 0;
    }

    return await this.processAndSaveOpportunities(rawContent, userId, mode as any);
  }

  private getModeSpecificSources(mode: string, roleAndSkills: string): string[] {
      const list = Object.keys(sourcesMasterlist).length > 0 ? sourcesMasterlist : FALLBACK_SOURCES;
      let sources: string[] = [];

      // Aggiungiamo SEMPRE i siti Gig (Upwork) perché sono gli unici affidabili al 100%
      sources.push(...(list.gig_quick || FALLBACK_SOURCES.gig_quick || []));

      if (mode !== 'daily') {
          // Per Weekly/Monthly aggiungiamo anche gli aggregatori puliti
          sources.push(...(list.aggregators_clean || list.aggregators || []));
          
          if (this.matches(roleAndSkills, ['dev', 'code'])) sources.push(...(list.tech || []));
          if (this.matches(roleAndSkills, ['writ', 'content'])) sources.push(...(list.writing_content || []));
          if (this.matches(roleAndSkills, ['design', 'ui'])) sources.push(...(list.design_creative || []));
      }
      
      // Filtro siti bannati
      return [...new Set(sources)]
          .filter(s => !s.includes('smartremote') && !s.includes('indeed') && !s.includes('peopleperhour'))
          .sort(() => 0.5 - Math.random());
  }

  private matches(text: string, keywords: string[]): boolean {
      return keywords.some(k => text.includes(k));
  }

  // ==================================================================================
  // 💾 SALVATAGGIO CON RETURN COUNT
  // ==================================================================================
  private async processAndSaveOpportunities(rawJson: string, userId: string, type: 'daily' | 'weekly' | 'monthly'): Promise<number> {
    try {
      let cleanContent = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      const firstBracket = cleanContent.indexOf('[');
      const lastBracket = cleanContent.lastIndexOf(']');
      
      if (firstBracket === -1 || lastBracket === -1) return 0;
      
      const missions = JSON.parse(cleanContent.substring(firstBracket, lastBracket + 1));
      let savedCount = 0;
      let estimatedHours = type === 'daily' ? 2 : (type === 'weekly' ? 8 : 40);
      let maxCommands = type === 'weekly' ? 100 : (type === 'monthly' ? 400 : 20);

      await db.transaction().execute(async (trx) => {
          for (const m of missions) {
            const finalUrl = m.source_url || m.url || "#";
            
            // LOG DI SCARTO PER DEBUG
            if (this.isBrokenSource(finalUrl)) {
                // console.log(`🗑️ Link scartato (Bannato): ${finalUrl}`);
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
      return savedCount; // Ritorna il numero reale di salvataggi
    } catch (e) { 
        console.error("❌ Errore Elaborazione JSON/DB:", e); 
        return 0;
    }
  }

  // --- UTILS: BLACKLIST ESTESA ---
  private isBrokenSource(url: string): boolean {
      if (!url || url.length < 10) return true;
      const lower = url.toLowerCase();

      const brokenDomains = [
          'smartremotejobs',  // Bannato
          'peopleperhour',    // Bannato (404 frequenti)
          'indeed.com',       // Link temporanei
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