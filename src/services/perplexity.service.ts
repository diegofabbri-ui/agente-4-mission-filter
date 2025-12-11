import axios from 'axios';
import { db } from '../infra/db';
import fs from 'fs';
import path from 'path';

export class PerplexityService {
  private apiKey: string;
  private kbPath: string;

  constructor() {
    this.apiKey = process.env.PERPLEXITY_API_KEY || '';
    
    // Gestione path per ambiente Produzione (dist) vs Sviluppo (src)
    const isProd = process.env.NODE_ENV === 'production';
    this.kbPath = isProd 
      ? path.join(process.cwd(), 'dist', 'knowledge_base')
      : path.join(process.cwd(), 'src', 'knowledge_base');
  }

  // Helper per caricare i prompt dai file .md
  private loadTextFile(filename: string): string {
    try {
      const filePath = path.join(this.kbPath, filename);
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8');
      }
      return ""; 
    } catch (e) {
      console.warn(`⚠️ Warning: Errore lettura file ${filename}.`);
      return ""; 
    }
  }

  // ==================================================================================
  // 🔍 CORE: RICERCA OPPORTUNITÀ (Daily, Weekly, Monthly)
  // ==================================================================================
  public async findGrowthOpportunities(userId: string, clientProfile: any, mode: 'daily' | 'weekly' | 'monthly' = 'daily') {
    
    console.log(`🚀 [HUNTER] Avvio caccia in modalità: ${mode.toUpperCase()}`);

    // 1. SELEZIONE DEL MANUALE (PROMPT)
    let systemInstruction = "";
    
    if (mode === 'weekly') {
        systemInstruction = this.loadTextFile('system_headhunter_weekly.md');
    } else if (mode === 'monthly') {
        systemInstruction = this.loadTextFile('system_headhunter_monthly.md');
    } else {
        // Default: Daily
        systemInstruction = this.loadTextFile('system_headhunter_prompt.md'); 
    }

    // Fallback se il file prompt non viene letto
    if (!systemInstruction || systemInstruction.length < 10) {
        systemInstruction = "You are an expert headhunter. Find active freelance jobs suitable for the requested duration. Return strictly JSON array.";
    }

    // 2. COSTRUZIONE DELLA QUERY CON OPERATORI AVANZATI
    // Questi operatori aiutano Perplexity a trovare pagine specifiche ed evitare liste generiche
    const searchContext = `
      CANDIDATE PROFILE:
      - Role: ${clientProfile.dreamRole}
      - Skills: ${(clientProfile.keySkillsToAcquire || []).join(', ')}
      - Interests: ${(clientProfile.interests || []).join(', ')}

      SEARCH STRATEGY (USE THESE OPERATORS):
      - site:upwork.com/jobs/ (Avoid /search/)
      - site:fiverr.com (Look for specific Gigs)
      - site:linkedin.com/jobs/view/ (Specific Job IDs)
      - site:freelancer.com/projects/
      - site:weworkremotely.com/remote-jobs/
    `;

    const searchMessages = [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: `${searchContext}\n\nTASK: Find 5 REAL, ACTIVE job listings matching the '${mode}' duration.\n\nMANDATORY RULES:\n1. 'source_url' MUST be a direct link to the job post.\n2. 'payout_estimation' MUST be a number string (e.g. "150"). Estimate if missing.\n3. Include 'tasks_breakdown' array for the graph.\n\nOUTPUT: JSON Array ONLY.` }
    ];

    try {
      // 3. CHIAMATA API PERPLEXITY
      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'sonar-pro', // Modello ottimizzato per la ricerca web
          messages: searchMessages,
          temperature: 0.1 // Molto basso per evitare allucinazioni
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const rawContent = response.data.choices[0].message.content;
      
      // 4. SALVATAGGIO NEL DB
      await this.processAndSaveOpportunities(rawContent, userId, mode);

    } catch (error: any) {
      console.error("❌ Errore Perplexity API:", error.response?.data || error.message);
      // Non lanciamo errore bloccante per non crashare il frontend
    }
  }

  // ==================================================================================
  // 💾 PARSING, VALIDAZIONE URL E SALVATAGGIO
  // ==================================================================================
  private async processAndSaveOpportunities(rawJson: string, userId: string, type: 'daily' | 'weekly' | 'monthly') {
    try {
      // --- FIX ROBUSTEZZA JSON ---
      // Rimuoviamo blocchi markdown e testo extra
      let cleanContent = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      
      // Estraiamo SOLO la parte tra le parentesi quadre [...]
      const firstBracket = cleanContent.indexOf('[');
      const lastBracket = cleanContent.lastIndexOf(']');
      
      if (firstBracket === -1 || lastBracket === -1) {
          console.error("⚠️ JSON Array non trovato nella risposta AI.");
          return;
      }
      
      const jsonStr = cleanContent.substring(firstBracket, lastBracket + 1);
      
      let missions;
      try {
          missions = JSON.parse(jsonStr);
      } catch (e) {
          console.error("⚠️ Errore JSON.parse sul contenuto estratto.");
          return;
      }

      // Definizione Limiti Comandi in base al tipo (Pacing)
      let maxCommands = 20; // Default Daily
      if (type === 'weekly') maxCommands = 100;
      if (type === 'monthly') maxCommands = 400;

      let savedCount = 0;

      // Inserimento nel Database
      for (const m of missions) {
        
        // 1. VALIDAZIONE URL (CRITICO)
        const finalUrl = m.source_url || m.url || "#";
        
        if (!this.isValidJobUrl(finalUrl)) {
            console.log(`Skipping invalid URL: ${finalUrl}`);
            continue;
        }

        // 2. Parsing Prezzo
        let reward = this.parseReward(m.payout_estimation || m.budget || m.reward || m.price);
        // Se il reward è 0 (es. "Negotiable"), mettiamo un valore placeholder simbolico (10)
        // per permettere all'utente di vederla e decidere.
        if (reward <= 0) reward = 10;

        // 3. Controllo duplicati (basato su URL)
        const exists = await db.selectFrom('missions')
            .select('id')
            .where('source_url', '=', finalUrl)
            .executeTakeFirst();

        if (!exists) {
            await db.insertInto('missions')
              .values({
                user_id: userId,
                title: m.title || "Nuova Opportunità",
                description: m.description || m.summary || "Nessuna descrizione fornita.",
                source_url: finalUrl,
                source: this.detectPlatform(finalUrl),
                reward_amount: reward,
                // Stima ore fissa in base al tipo se non fornita
                estimated_duration_hours: m.hours || (type === 'weekly' ? 5 : (type === 'monthly' ? 40 : 1)),
                status: 'pending',
                
                // NUOVI CAMPI PER LA GESTIONE DEL TEMPO
                type: type, 
                max_commands: maxCommands,
                command_count: 0,
                conversation_history: JSON.stringify([]), // Inizializza memoria vuota
                
                // Metadati extra e grafico
                platform: this.detectPlatform(finalUrl),
                company_name: m.company_name || m.company || "Confidenziale",
                match_score: m.match_score || 85,
                analysis_notes: m.analysis_notes || `Caccia ${type} completata.`,
                raw_data: JSON.stringify({ tasks_breakdown: m.tasks_breakdown || [] })
              })
              .execute();
            savedCount++;
        }
      }
      console.log(`✅ Salvate ${savedCount} nuove missioni (${type}).`);

    } catch (e) {
      console.error("❌ Errore Parsing/Salvataggio Missioni:", e);
    }
  }

  // ==================================================================================
  // 🧮 UTILS DI VALIDAZIONE
  // ==================================================================================

  // Decide se l'URL è un vero annuncio di lavoro o spazzatura
  private isValidJobUrl(url: string): boolean {
      if (!url || url.length < 10 || url === "#") return false;
      if (!url.startsWith('http')) return false;

      // Filtra URL di ricerca generici
      const badPatterns = ['/search', 'jobs?q=', 'login', 'signup', 'browse', '...'];
      if (badPatterns.some(p => url.includes(p))) return false;

      // Filtra URL troncati dall'AI
      if (url.endsWith('.')) return false;

      // (Opzionale) Controlla pattern specifici per piattaforme note
      // Questo riduce drasticamente i 404
      if (url.includes('upwork.com') && !url.includes('/jobs/')) return false; 
      if (url.includes('linkedin.com') && !url.includes('/jobs/view/')) return false;

      return true;
  }

  private detectPlatform(url: string): string {
      if (url.includes('upwork')) return 'Upwork';
      if (url.includes('fiverr')) return 'Fiverr';
      if (url.includes('linkedin')) return 'LinkedIn';
      if (url.includes('freelancer')) return 'Freelancer';
      if (url.includes('toptal')) return 'Toptal';
      return 'Web';
  }

  // Helper robusto per estrarre numeri dalle stringhe budget
  private parseReward(rewardString: string | number): number {
    if (typeof rewardString === 'number') return rewardString;
    if (!rewardString) return 0;
    
    // Gestione range "$50-$100" -> prende la media (75)
    if (typeof rewardString === 'string' && rewardString.includes('-')) {
        const parts = rewardString.split('-');
        const n1 = parseFloat(parts[0].replace(/[^0-9.]/g, ''));
        const n2 = parseFloat(parts[1].replace(/[^0-9.]/g, ''));
        
        if (!isNaN(n1) && !isNaN(n2)) {
            return Math.floor((n1 + n2) / 2);
        }
    }

    // Gestione singola cifra "$500" o "500 USD"
    const clean = rewardString.replace(/[^0-9.]/g, '');
    return parseFloat(clean) || 0;
  }
}