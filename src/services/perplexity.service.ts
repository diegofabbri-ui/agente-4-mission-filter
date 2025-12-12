import axios from 'axios';
import { db } from '../infra/db';
import { sql } from 'kysely'; 
import fs from 'fs';
import path from 'path';

// --- 1. CONFIGURAZIONE "GARDEN" (SOLO FONTI DIRETTE) ---
const FALLBACK_SOURCES = {
    // Solo siti che sappiamo essere affidabili e con link persistenti
    trusted_aggregators: ["remoteok.com", "weworkremotely.com", "nodesk.co", "remotive.com", "workingnomads.com"],
    freelance_platforms: ["upwork.com", "freelancer.com", "guru.com"],
    tech_specialized: ["gun.io", "toptal.com", "ycombinator.com", "wellfound.com", "stackoverflow.com"],
    content_creative: ["problogger.com", "bestwriting.com", "behance.net", "dribbble.com"],
    marketing_biz: ["marketerhire.com", "growth.org", "exitfive.com"]
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
            console.log(`✅ [SYSTEM] Whitelist fonti caricata: ${p}`);
            break;
        }
    }
} catch (e) {
    console.warn("⚠️ [SYSTEM] Masterlist non trovata. Uso Fallback Whitelist.");
}

export class PerplexityService {
  private apiKey: string;
  private kbPath: string;
  private allowedDomains: string[] = [];

  constructor() {
    this.apiKey = process.env.PERPLEXITY_API_KEY || '';
    const isProd = process.env.NODE_ENV === 'production';
    this.kbPath = isProd 
      ? path.join(process.cwd(), 'dist', 'knowledge_base')
      : path.join(process.cwd(), 'src', 'knowledge_base');
      
    // Inizializza la Whitelist dei domini
    this.allowedDomains = this.extractDomains(sourcesMasterlist);
  }

  private extractDomains(sourceObj: any): string[] {
      const allUrls: string[] = Object.values(sourceObj).flat() as string[];
      // Pulisce gli URL per ottenere solo il dominio base (es. "upwork.com")
      return allUrls.map(u => {
          try {
              const urlStr = u.startsWith('http') ? u : `https://${u}`;
              return new URL(urlStr).hostname.replace('www.', '');
          } catch (e) { return u.split('/')[0]; }
      });
  }

  private loadTextFile(filename: string): string {
    try {
      const filePath = path.join(this.kbPath, filename);
      if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf-8');
      return "";
    } catch (e) { return ""; }
  }

  // ==================================================================================
  // 🔍 CORE: RICERCA "WHITELIST ONLY"
  // ==================================================================================
  public async findGrowthOpportunities(userId: string, clientProfile: any, mode: 'daily' | 'weekly' | 'monthly' = 'daily') {
    
    const recencyFilter = mode === 'daily' ? 'day' : 'week';
    console.log(`🚀 [HUNTER] Caccia ${mode.toUpperCase()} | Mode: Strict Whitelist`);

    let systemInstruction = "";
    if (mode === 'weekly') systemInstruction = this.loadTextFile('system_headhunter_weekly.md');
    else if (mode === 'monthly') systemInstruction = this.loadTextFile('system_headhunter_monthly.md');
    else systemInstruction = this.loadTextFile('system_headhunter_prompt.md');

    if (!systemInstruction) systemInstruction = "You are an expert headhunter. Find active freelance jobs.";

    const userRole = (clientProfile.dreamRole || "freelancer").toLowerCase();
    const userSkills = (clientProfile.keySkillsToAcquire || []).join(' ').toLowerCase();
    
    // Seleziona 10 siti dalla Whitelist da passare al prompt
    const targetSites = this.getRelevantSources(userRole + " " + userSkills).slice(0, 10);
    
    const searchContext = `
      ROLE: ${clientProfile.dreamRole}
      SKILLS: ${(clientProfile.keySkillsToAcquire || []).join(', ')}
      
      --- 🎯 STRICT SEARCH COMMAND ---
      Find 5 ACTIVE freelance/contract listings published in the last ${recencyFilter === 'day' ? '24 hours' : '7 days'}.
      
      **ALLOWED SOURCES ONLY:**
      ${targetSites.join(', ')}
      
      **CRITICAL RULES:**
      1. **WHITELIST ONLY:** Do NOT return results from "smartremotejobs", "indeed", "glassdoor", "linkedin". ONLY use the sites listed above.
      2. **DIRECT LINKS:** The URL must link directly to the job post on the source platform.
      3. **NO FULL-TIME:** Discard listings with "W2", "Benefits", "Health Insurance".
    `;

    try {
      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'sonar-pro', 
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: `${searchContext}\n\nOUTPUT: JSON Array ONLY. Valid Direct URLs only.` }
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

  private getRelevantSources(roleAndSkills: string): string[] {
      // Logica semplificata: restituisce i siti dalla whitelist che matchano (o tutti se generico)
      const list = Object.keys(sourcesMasterlist).length > 0 ? sourcesMasterlist : FALLBACK_SOURCES;
      let sources: string[] = [];
      
      // Aggiunge sempre i generalisti e aggregatori puliti
      sources.push(...(list.aggregators_clean || list.aggregators || []));
      sources.push(...(list.general_freelance || []));

      if (this.matches(roleAndSkills, ['dev', 'code', 'tech'])) sources.push(...(list.tech_dev || []));
      if (this.matches(roleAndSkills, ['writ', 'content'])) sources.push(...(list.writing_content || []));
      if (this.matches(roleAndSkills, ['design', 'ui', 'ux'])) sources.push(...(list.design_creative || []));
      
      return [...new Set(sources)].sort(() => 0.5 - Math.random());
  }

  private matches(text: string, keywords: string[]): boolean {
      return keywords.some(k => text.includes(k));
  }

  // ==================================================================================
  // 💾 SALVATAGGIO (Con Whitelist Check)
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
            
            // --- VALIDAZIONE WHITELIST (Il Filtro Supremo) ---
            if (!this.isValidTrustedUrl(finalUrl)) {
                // console.log(`https://www.merriam-webster.com/dictionary/rejected Dominio non fidato o bannato: ${finalUrl}`);
                continue; // Salta questo risultato
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
      console.log(`✅ Saved ${savedCount} valid missions from TRUSTED sources.`);
    } catch (e) { console.error("❌ Processing Error:", e); }
  }

  // --- UTILS: WHITELIST LOGIC ---
  private isValidTrustedUrl(url: string): boolean {
      if (!url || url.length < 15 || !url.startsWith('http')) return false;
      const lower = url.toLowerCase();

      // 1. BLACKLIST ESPLICITA (Siti bannati)
      const blacklist = [
          'smartremotejobs', // IL COLPEVOLE
          'indeed', 'glassdoor', 'google.com/search', 
          'login', 'signup', 'profile', 'resume'
      ];
      if (blacklist.some(b => lower.includes(b))) return false;

      // 2. WHITELIST CHECK (Deve essere nella nostra lista approvata)
      // Se sourcesMasterlist è popolato, usiamo quello. Altrimenti fallback sui siti comuni.
      // Controlla se il dominio dell'URL è contenuto in uno dei domini fidati
      const isTrusted = this.allowedDomains.some(trustedDomain => lower.includes(trustedDomain.toLowerCase()));
      
      // Se non è nella whitelist, lo scartiamo. (Closed Garden)
      return isTrusted;
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