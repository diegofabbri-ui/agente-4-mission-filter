import axios from 'axios';
import { db } from '../infra/db';
import { sql } from 'kysely'; 
import fs from 'fs';
import path from 'path';

// --- 1. CONFIGURAZIONE "GIG FOCUSED" ---
// Fallback specifico per garantire fonti rapide se il JSON manca
const FALLBACK_SOURCES = {
    gig_quick: ["upwork.com/jobs", "freelancer.com/projects", "reddit.com/r/forhire", "guru.com/d/jobs"],
    aggregators: ["remoteok.com", "nodesk.co", "remotive.com"],
    tech: ["gun.io", "wellfound.com/jobs"],
    creative: ["behance.net/joblist", "dribbble.com/jobs"]
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
  // 🔍 CORE: RICERCA "GIG-SPECIFIC" (Validazione Regex + Recency)
  // ==================================================================================
  public async findGrowthOpportunities(userId: string, clientProfile: any, mode: 'daily' | 'weekly' | 'monthly' = 'daily') {
    
    // Configurazione: Se è Daily, vogliamo SOLO le ultime 24h.
    const recencyFilter = mode === 'daily' ? 'day' : 'week';
    
    console.log(`🚀 [HUNTER] Caccia ${mode.toUpperCase()} | Recency: ${recencyFilter} | Strict Link Validation: ON`);

    let systemInstruction = "";
    if (mode === 'weekly') systemInstruction = this.loadTextFile('system_headhunter_weekly.md');
    else if (mode === 'monthly') systemInstruction = this.loadTextFile('system_headhunter_monthly.md');
    else systemInstruction = this.loadTextFile('system_headhunter_prompt.md');

    if (!systemInstruction) systemInstruction = "You are an expert headhunter. Find active freelance gigs.";

    const userRole = (clientProfile.dreamRole || "freelancer").toLowerCase();
    const userSkills = (clientProfile.keySkillsToAcquire || []).join(' ').toLowerCase();
    
    // --- SELEZIONE INTELLIGENTE DELLE FONTI ---
    // Se cerchiamo 'Daily', usiamo SOLO i siti di "Lavoretti" (Gig), non i siti di carriera.
    const targetSites = this.getModeSpecificSources(mode, userRole + " " + userSkills).slice(0, 12);
    
    const searchContext = `
      ROLE: ${clientProfile.dreamRole}
      SKILLS: ${(clientProfile.keySkillsToAcquire || []).join(', ')}
      
      --- 🎯 SEARCH COMMAND ---
      Find 5 ACTIVE listings published in the last ${recencyFilter === 'day' ? '24 hours' : '7 days'}.
      
      **EXCLUSIVE SOURCES:**
      ${targetSites.join(', ')}
      
      **STRICT VALIDATION RULES:**
      1. **LINK CHECK:** URL must follow the platform's pattern (e.g. upwork.com/jobs/..., freelancer.com/projects/...). NO generic search pages.
      2. **SCOPE CHECK:** - DAILY: Max 2 hours effort. "Quick fix", "Task".
         - WEEKLY: Max 10 hours effort. "Mini-Project".
         - MONTHLY: Retainer/Contract.
      3. **NO FULL-TIME:** If it mentions "Annual Salary", "Benefits", "W2" -> DISCARD.
    `;

    try {
      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'sonar-pro', 
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: `${searchContext}\n\nOUTPUT: JSON Array ONLY. 5 Results. Direct Valid URLs.` }
          ],
          search_recency_filter: recencyFilter, 
          temperature: 0.1 
        },
        { headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' } }
      );

      const rawContent = response.data.choices[0].message.content;
      await this.processAndSaveOpportunities(rawContent, userId, mode);

    } catch (error: any) {
      console.error("❌ API Error:", error.message);
    }
  }

  // --- SELEZIONE FONTI PER MODALITÀ ---
  private getModeSpecificSources(mode: string, roleAndSkills: string): string[] {
      const list = Object.keys(sourcesMasterlist).length > 0 ? sourcesMasterlist : FALLBACK_SOURCES;
      let sources: string[] = [];

      if (mode === 'daily') {
          // DAILY: Solo siti di Gig rapidi
          sources.push(...(list.gig_quick || FALLBACK_SOURCES.gig_quick || []));
          // Aggiungi nicchia se pertinente, ma con cautela
          if (roleAndSkills.includes('writ')) sources.push(...(list.writing_content || []));
          // NO Aggregatori "Corporate" (WeWorkRemotely, ecc.) per i Daily!
      } else {
          // WEEKLY/MONTHLY: Aggregatori + Nicchia + Generalisti
          sources.push(...(list.aggregators_clean || list.aggregators || []));
          sources.push(...(list.general_freelance || []));
          
          if (this.matches(roleAndSkills, ['dev', 'code'])) sources.push(...(list.tech_dev || []));
          if (this.matches(roleAndSkills, ['writ', 'content'])) sources.push(...(list.writing_content || []));
          if (this.matches(roleAndSkills, ['design', 'ui'])) sources.push(...(list.design_creative || []));
          if (this.matches(roleAndSkills, ['market', 'sales'])) sources.push(...(list.marketing_sales || []));
      }
      
      return [...new Set(sources)].sort(() => 0.5 - Math.random());
  }

  private matches(text: string, keywords: string[]): boolean {
      return keywords.some(k => text.includes(k));
  }

  // --- SALVATAGGIO CON VALIDAZIONE REGEX ---
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
            
            // --- VALIDAZIONE REGEX RIGIDA ---
            if (!this.isValidRealJobLink(finalUrl)) {
                console.log(`[LINK DISCARDED] Fake/Broken URL: ${finalUrl}`);
                continue;
            }

            const exists = await trx.selectFrom('missions').select('id').where('source_url', '=', finalUrl).executeTakeFirst();

            if (!exists) {
                const newMission = await trx.insertInto('missions')
                  .values({
                    user_id: userId,
                    title: m.title || "Gig Rapido",
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
                            content: `Nuova Missione (${type}) trovata. Fonte: ${this.detectPlatform(finalUrl)}`,
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
      console.log(`✅ Saved ${savedCount} verified gigs.`);
    } catch (e) { console.error("❌ Processing Error:", e); }
  }

  // --- UTILS: VALIDAZIONE URL BASATA SU PATTERN REALI ---
  private isValidRealJobLink(url: string): boolean {
      if (!url || url.length < 15 || !url.startsWith('http')) return false;
      const lower = url.toLowerCase();

      // Blacklist Generica
      if (['login', 'signup', 'search', 'indeed', 'glassdoor', 'google'].some(x => lower.includes(x))) return false;

      // VALIDAZIONE SPECIFICA PER PIATTAFORMA (Evita link inventati)
      if (lower.includes('upwork.com')) {
          // Upwork jobs validi hanno '~' (tilde) o '/jobs/' seguito da ID
          return lower.includes('~') || lower.includes('/jobs/');
      }
      if (lower.includes('freelancer.com')) {
          return lower.includes('/projects/');
      }
      if (lower.includes('reddit.com')) {
          return lower.includes('/comments/');
      }
      if (lower.includes('guru.com')) {
          return lower.includes('/jobs/');
      }
      if (lower.includes('behance.net')) {
          return lower.includes('/joblist/');
      }

      // Per altri siti, ci fidiamo se ha segmenti "job-like"
      const genericValid = ['/job/', '/project/', '/contract/', '/gig/', '/opportunity/'];
      return genericValid.some(p => lower.includes(p));
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