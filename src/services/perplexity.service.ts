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
      console.warn(`⚠️ Warning: File non trovato: ${filePath}`);
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

    // 1. SELEZIONE DEL MANUALE (PROMPT) E FILTRI BUDGET
    let systemInstruction = "";
    let budgetContext = "CRITICAL: IGNORE jobs with 'Unpaid'. ONLY return jobs with a budget.";

    if (mode === 'weekly') {
        systemInstruction = this.loadTextFile('system_headhunter_weekly.md');
        budgetContext += " TARGET: Short-term projects, sprints, fixed price.";
    } else if (mode === 'monthly') {
        systemInstruction = this.loadTextFile('system_headhunter_monthly.md');
        budgetContext += " TARGET: Monthly Retainers, Long-term contracts.";
    } else {
        // Default: Daily
        systemInstruction = this.loadTextFile('system_headhunter_prompt.md'); 
        budgetContext += ` TARGET: Hourly tasks, micro-projects.`;
    }

    // Fallback se il file prompt non viene letto
    if (!systemInstruction || systemInstruction.length < 10) {
        systemInstruction = "You are an expert headhunter. Find active freelance jobs suitable for the requested duration. Return strictly JSON array.";
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
      { role: 'user', content: `${userContext}\n\nTASK: Find 5 REAL, ACTIVE job listings on Upwork, Fiverr, LinkedIn, or Toptal matching the '${mode}' duration.\n\nMANDATORY: Return valid JSON Array. Include 'url' and 'tasks_breakdown'.` }
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
      // Non lanciamo errore bloccante per non crashare il frontend, ma logghiamo
    }
  }

  // ==================================================================================
  // 💾 PARSING E SALVATAGGIO (Gestisce Type, Max Commands e Filtro Prezzi)
  // ==================================================================================
  private async processAndSaveOpportunities(rawJson: string, userId: string, type: 'daily' | 'weekly' | 'monthly') {
    try {
      // --- FIX ROBUSTEZZA JSON ---
      // Rimuoviamo blocchi markdown
      let cleanContent = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      
      // Estraiamo SOLO la parte tra le parentesi quadre [...]
      const firstBracket = cleanContent.indexOf('[');
      const lastBracket = cleanContent.lastIndexOf(']');
      
      if (firstBracket === -1 || lastBracket === -1) {
          console.error("⚠️ JSON Array non trovato nella risposta AI. Raw:", rawJson.substring(0, 100));
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
        
        // 1. Parsing Prezzo
        let reward = this.parseReward(m.payout_estimation || m.budget || m.reward || m.price);
        
        // Se il reward è 0 (es. "Negotiable"), mettiamo un valore placeholder simbolico (10)
        // per permettere all'utente di vederla e decidere.
        if (reward <= 0) reward = 10;

        // 2. Controllo duplicati (basato su URL)
        const finalUrl = m.source_url || m.url || "#";
        const exists = await db.selectFrom('missions')
            .select('id')
            .where('source_url', '=', finalUrl)
            .executeTakeFirst();

        if (!exists && finalUrl !== "#") {
            await db.insertInto('missions')
              .values({
                user_id: userId,
                title: m.title || "Nuova Opportunità",
                description: m.description || m.summary || "Nessuna descrizione fornita.",
                source_url: finalUrl,
                source: m.platform || m.source || "Web",
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
                platform: m.platform || "General",
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

    // Gestione singola cifra "$500" o "500 USD" o "€500"
    const clean = rewardString.replace(/[^0-9.]/g, '');
    return parseFloat(clean) || 0;
  }
}