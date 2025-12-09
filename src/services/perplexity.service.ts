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

    // 1. SELEZIONE DEL MANUALE (PROMPT) CORRETTO
    let systemInstruction = "";
    let budgetContext = "";

    if (mode === 'weekly') {
        // Carica il cacciatore settimanale (Sprint da 3.5 ore / 1 settimana)
        systemInstruction = this.loadTextFile('system_headhunter_weekly.md');
        budgetContext = "Focus on Fixed Price projects ($250-$1200) or short-term urgency.";
    } else if (mode === 'monthly') {
        // Carica il cacciatore mensile (Retainers / Progetti complessi)
        systemInstruction = this.loadTextFile('system_headhunter_monthly.md');
        budgetContext = "Focus on Monthly Retainers (>$2000/mo) or Large Fixed Projects.";
    } else {
        // Default: Daily (Micro-task)
        systemInstruction = this.loadTextFile('system_headhunter_prompt.md'); 
        budgetContext = `Focus on quick hourly tasks or micro-projects matching rate: ${clientProfile.minHourlyRate} EUR/hr.`;
    }

    // Fallback se il file manca
    if (!systemInstruction) {
        systemInstruction = "You are an expert headhunter. Find freelance jobs suitable for the requested duration.";
    }

    // 2. COSTRUZIONE DELLA QUERY
    const userContext = `
      CANDIDATE PROFILE:
      - Role: ${clientProfile.dreamRole}
      - Skills: ${(clientProfile.keySkillsToAcquire || []).join(', ')}
      - Interests: ${(clientProfile.interests || []).join(', ')}
      - Constraints: ${budgetContext}
    `;

    const searchMessages = [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: `${userContext}\n\nTASK: Find the best 5 active job listings on Upwork, Fiverr, LinkedIn, or Toptal that match this profile and the '${mode}' duration requirement. Return strictly JSON.` }
    ];

    try {
      // 3. CHIAMATA API PERPLEXITY
      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'sonar-pro', // Modello ottimizzato per la ricerca web
          messages: searchMessages,
          temperature: 0.2 // Bassa temperatura per dati precisi
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const rawContent = response.data.choices[0].message.content;
      
      // 4. SALVATAGGIO NEL DB CON I PARAMETRI NUOVI
      await this.processAndSaveOpportunities(rawContent, userId, mode);

    } catch (error: any) {
      console.error("❌ Errore Perplexity API:", error.response?.data || error.message);
      throw new Error("Impossibile completare la ricerca su Perplexity.");
    }
  }

  // ==================================================================================
  // 💾 PARSING E SALVATAGGIO (Gestisce Type e Max Commands)
  // ==================================================================================
  private async processAndSaveOpportunities(rawJson: string, userId: string, type: 'daily' | 'weekly' | 'monthly') {
    try {
      // Pulizia del JSON (rimuove backticks o testo extra)
      const cleanJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      const startIndex = cleanJson.indexOf('[');
      const endIndex = cleanJson.lastIndexOf(']');
      
      if (startIndex === -1 || endIndex === -1) throw new Error("JSON non trovato nella risposta.");
      
      const jsonStr = cleanJson.substring(startIndex, endIndex + 1);
      const missions = JSON.parse(jsonStr);

      // Definizione Limiti Comandi in base al tipo
      let maxCommands = 20; // Default Daily
      if (type === 'weekly') maxCommands = 100;
      if (type === 'monthly') maxCommands = 400;

      // Inserimento nel Database
      for (const m of missions) {
        // Controllo duplicati (basato su URL)
        const exists = await db.selectFrom('missions')
            .select('id')
            .where('source_url', '=', m.url || m.source_url)
            .executeTakeFirst();

        if (!exists) {
            await db.insertInto('missions')
              .values({
                user_id: userId,
                title: m.title || "Opportunità senza titolo",
                description: m.description || m.summary || "Nessuna descrizione",
                source_url: m.url || m.source_url || "#",
                source: m.source || "Web",
                reward_amount: this.parseReward(m.budget || m.reward),
                estimated_duration_hours: m.hours || 1,
                status: 'pending',
                
                // NUOVI CAMPI PER LA GESTIONE DEL TEMPO
                type: type, // 'daily', 'weekly', 'monthly'
                max_commands: maxCommands,
                command_count: 0,
                conversation_history: JSON.stringify([]), // Inizializza memoria vuota
                
                // Metadati extra
                platform: m.platform || "General",
                company_name: m.company || "Confidenziale",
                match_score: m.match_score || 80,
                analysis_notes: m.analysis_notes || "Generato da Agente-4",
                raw_data: JSON.stringify(m)
              })
              .execute();
        }
      }
      console.log(`✅ Salvate ${missions.length} missioni (${type}).`);

    } catch (e) {
      console.error("Errore Parsing/Salvataggio Missioni:", e);
      // Non blocchiamo tutto se il parsing fallisce, ma lo logghiamo
    }
  }

  // Helper per estrarre numeri dalle stringhe budget (es. "$500" -> 500)
  private parseReward(rewardString: string | number): number {
    if (typeof rewardString === 'number') return rewardString;
    if (!rewardString) return 0;
    const clean = rewardString.replace(/[^0-9.]/g, '');
    return parseFloat(clean) || 0;
  }
}