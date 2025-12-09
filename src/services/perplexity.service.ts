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
    // Questo è fondamentale affinché Railway trovi i file .md
    const isProd = process.env.NODE_ENV === 'production';
    this.kbPath = isProd 
      ? path.join(process.cwd(), 'dist', 'knowledge_base')
      : path.join(process.cwd(), 'src', 'knowledge_base');
  }

  // Helper per caricare i prompt dai file .md
  private loadTextFile(filename: string): string {
    try {
      const filePath = path.join(this.kbPath, filename);
      return fs.readFileSync(filePath, 'utf-8');
    } catch (e) {
      console.warn(`⚠️ Warning: Impossibile caricare il file ${filename}. Uso fallback.`);
      return ""; 
    }
  }

  // ==================================================================================
  // 🔍 CORE: RICERCA OPPORTUNITÀ (Daily, Weekly, Monthly)
  // ==================================================================================
  public async findGrowthOpportunities(userId: string, clientProfile: any, mode: 'daily' | 'weekly' | 'monthly' = 'daily') {
    
    console.log(`🚀 [HUNTER] Avvio caccia in modalità: ${mode.toUpperCase()}`);

    // 1. SELEZIONE DEL MANUALE (PROMPT) E FILTRI BUDGET
    let systemInstruction = "";
    let budgetContext = "CRITICAL: IGNORE jobs with 'Negotiable', 'DOE', or 'Unpaid'. ONLY return jobs with a specific numeric budget.";

    if (mode === 'weekly') {
        // Carica il cacciatore settimanale
        systemInstruction = this.loadTextFile('system_headhunter_weekly.md');
        budgetContext += " TARGET: Fixed Price projects between $250 - $1200.";
    } else if (mode === 'monthly') {
        // Carica il cacciatore mensile
        systemInstruction = this.loadTextFile('system_headhunter_monthly.md');
        budgetContext += " TARGET: Monthly Retainers > $2000/mo or Large Fixed Projects > $3000.";
    } else {
        // Default: Daily (Micro-task)
        systemInstruction = this.loadTextFile('system_headhunter_prompt.md'); 
        budgetContext += ` TARGET: Hourly rate around ${clientProfile.minHourlyRate || 30} EUR/hr or Small Fixed Tasks.`;
    }

    // Fallback se il file prompt non viene letto
    if (!systemInstruction || systemInstruction.length < 10) {
        systemInstruction = "You are an expert headhunter. Find freelance jobs suitable for the requested duration. Return strictly JSON.";
    }

    // 2. COSTRUZIONE DELLA QUERY
    const userContext = `
      CANDIDATE PROFILE:
      - Role: ${clientProfile.dreamRole}
      - Skills: ${(clientProfile.keySkillsToAcquire || []).join(', ')}
      - Interests: ${(clientProfile.interests || []).join(', ')}
      - Budget Constraints: ${budgetContext}
    `;

    const searchMessages = [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: `${userContext}\n\nTASK: Find the best 5 active, REAL job listings on Upwork, Fiverr, LinkedIn, or Toptal matching the '${mode}' duration.\n\nMANDATORY: Return valid JSON. Ensure 'budget' is a number string (e.g. "500"). Include 'url' and a detailed 'description'.` }
    ];

    try {
      // 3. CHIAMATA API PERPLEXITY
      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'sonar-pro', // Modello ottimizzato per la ricerca web
          messages: searchMessages,
          temperature: 0.1 // Molto basso per evitare allucinazioni sui prezzi
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
      throw new Error("Impossibile completare la ricerca su Perplexity.");
    }
  }

  // ==================================================================================
  // 💾 PARSING E SALVATAGGIO (Gestisce Type, Max Commands e Filtro Prezzi)
  // ==================================================================================
  private async processAndSaveOpportunities(rawJson: string, userId: string, type: 'daily' | 'weekly' | 'monthly') {
    try {
      // Pulizia del JSON (rimuove backticks o testo extra generato dall'LLM)
      const cleanJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      const startIndex = cleanJson.indexOf('[');
      const endIndex = cleanJson.lastIndexOf(']');
      
      if (startIndex === -1 || endIndex === -1) throw new Error("JSON non trovato nella risposta.");
      
      const jsonStr = cleanJson.substring(startIndex, endIndex + 1);
      const missions = JSON.parse(jsonStr);

      // Definizione Limiti Comandi in base al tipo (Pacing)
      let maxCommands = 20; // Default Daily
      if (type === 'weekly') maxCommands = 100;
      if (type === 'monthly') maxCommands = 400;

      let savedCount = 0;

      // Inserimento nel Database
      for (const m of missions) {
        
        // 1. Parsing e Validazione Prezzo
        const reward = this.parseReward(m.budget || m.reward || m.price);
        
        // FILTRO: Se paga 0 o meno di 10$, SCARTA.
        if (reward < 10) {
            console.log(`Skipping low/zero budget job: ${m.title} (${reward})`);
            continue;
        }

        // 2. Controllo duplicati (basato su URL)
        const exists = await db.selectFrom('missions')
            .select('id')
            .where('source_url', '=', m.url || m.source_url)
            .executeTakeFirst();

        if (!exists) {
            await db.insertInto('missions')
              .values({
                user_id: userId,
                title: m.title || "Opportunità senza titolo",
                description: m.description || m.summary || "Nessuna descrizione fornita.",
                source_url: m.url || m.source_url || "https://upwork.com",
                source: m.source || "Web",
                reward_amount: reward,
                // Stima ore fissa in base al tipo se non fornita
                estimated_duration_hours: m.hours || (type === 'weekly' ? 5 : (type === 'monthly' ? 40 : 1)),
                status: 'pending',
                
                // NUOVI CAMPI PER LA GESTIONE DEL TEMPO
                type: type, 
                max_commands: maxCommands,
                command_count: 0,
                conversation_history: JSON.stringify([]), // Inizializza memoria vuota
                
                // Metadati extra
                platform: m.platform || "General",
                company_name: m.company || "Confidenziale",
                match_score: m.match_score || 85,
                analysis_notes: m.analysis_notes || `Opportunità rilevata in modalità ${type.toUpperCase()}.`,
                raw_data: JSON.stringify(m)
              })
              .execute();
            savedCount++;
        }
      }
      console.log(`✅ Salvate ${savedCount} nuove missioni (${type}).`);

    } catch (e) {
      console.error("Errore Parsing/Salvataggio Missioni:", e);
      // Non blocchiamo tutto se il parsing fallisce, ma lo logghiamo
    }
  }

  // ==================================================================================
  // 🧮 UTILS
  // ==================================================================================

  // Helper robusto per estrarre numeri dalle stringhe budget
  private parseReward(rewardString: string | number): number {
    if (typeof rewardString === 'number') return rewardString;
    if (!rewardString) return 0;
    
    // Gestione range "$50-$100" -> prende la media (75)
    if (typeof rewardString === 'string' && rewardString.includes('-')) {
        const parts = rewardString.split('-');
        // Rimuove tutto ciò che non è numero o punto
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