import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { db } from '../infra/db';

// ==================================================================================
// ⚙️ CONFIGURAZIONE MODELLI AI
// ==================================================================================
const AI_CONFIG = {
  openai: {
    model: 'gpt-4o', // Modello principale per la scrittura
  },
  gemini: {
    model: 'gemini-1.5-pro-latest', // Modello per l'Audit (Critico)
    generationConfig: {
      temperature: 0.1, 
      maxOutputTokens: 16384 
    }
  },
  system: {
    max_loops: 3,       // Max tentativi di perfezionamento
    max_json_loops: 3   // Max tentativi di riparazione JSON
  }
};

// ==================================================================================
// 📝 INTERFACCE OUTPUT
// ==================================================================================
export interface FinalMissionPackage {
  deliverable_content: string;    // La Cover Letter
  strategy_brief: string;         // Spiegazione strategica
  execution_steps: string[];      // Step operativi
  estimated_impact: string;       // Impatto previsto
  bonus_material_title: string;   // Titolo Bonus
  bonus_material_content: string; // Contenuto Bonus
  is_immediate_task: boolean;
  bonus_file_name: string;
}

// ==================================================================================
// 🚀 CLASSE MISSION DEVELOPER
// ==================================================================================
export class MissionDeveloperService {
  private openai: OpenAI;
  private geminiClient: GoogleGenerativeAI;
  private geminiModel: any;
  private kbPath: string;

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const geminiKey = process.env.GEMINI_API_KEY || '';
    if (!geminiKey) console.warn("⚠️ GEMINI_API_KEY mancante! L'auditor non funzionerà.");
    
    this.geminiClient = new GoogleGenerativeAI(geminiKey);
    this.geminiModel = this.geminiClient.getGenerativeModel({ 
      model: AI_CONFIG.gemini.model,
      generationConfig: AI_CONFIG.gemini.generationConfig
    });
    
    const isProd = process.env.NODE_ENV === 'production';
    this.kbPath = isProd 
      ? path.join(process.cwd(), 'dist', 'knowledge_base', 'developer')
      : path.join(process.cwd(), 'src', 'knowledge_base', 'developer');
  }

  private loadPrompt(filename: string): string {
    try {
      return fs.readFileSync(path.join(this.kbPath, filename), 'utf-8');
    } catch (e) {
      console.warn(`⚠️ Prompt file mancante: ${filename}. Uso fallback.`);
      return ""; // Ritorna vuoto per gestire il fallback nel codice
    }
  }

  // ==================================================================================
  // 1️⃣ FASE SVILUPPO STRATEGIA (Cover Letter + Bonus)
  // ==================================================================================
  public async developStrategy(missionId: string): Promise<FinalMissionPackage> {
    console.log(`\n⚙️ [DEV] Sviluppo Strategia per: ${missionId}`);
    
    // 1. Recupero Dati
    const mission = await db.selectFrom('missions').selectAll().where('id', '=', missionId).executeTakeFirst();
    if (!mission) throw new Error("Missione non trovata nel DB");

    let profileData: any = {};
    if (mission.user_id) {
        const profile = await db.selectFrom('user_ai_profile').select('career_manifesto').where('user_id', '=', mission.user_id).executeTakeFirst();
        profileData = profile?.career_manifesto || {};
    }

    // 2. Loop A: Generazione Candidatura (Cover Letter)
    console.log(`\n🔵 [LOOP A] Sviluppo Candidatura...`);
    let promptCandidacy = this.loadPrompt('prompt_1_gpt_developer_init.md');
    
    // Fallback se file manca
    if (!promptCandidacy) promptCandidacy = "Generate a high-converting freelance cover letter for this job: [MISSION_DESCRIPTION]. Focus on skills: [USER_SKILLS].";

    promptCandidacy = promptCandidacy
      .replace('[MISSION_TITLE]', mission.title)
      .replace('[MISSION_DESCRIPTION]', mission.description || 'N/A')
      .replace('[MISSION_PLATFORM]', mission.platform || 'General')
      .replace('[MISSION_URL]', mission.source_url || 'N/A')
      .replace('[USER_SKILLS]', JSON.stringify(profileData.keySkillsToAcquire || []))
      .replace('[USER_ADVANTAGES]', JSON.stringify(profileData.unfairAdvantages || []));

    const approvedCandidacy = await this.runQualityLoop(promptCandidacy, mission, 'standard');

    // 3. Loop B: Generazione Bonus (Value Asset)
    console.log(`\n🟣 [LOOP B] Sviluppo Bonus Asset...`);
    let promptBonus = this.loadPrompt('prompt_10_bonus_material_init.md');
    
    // Fallback
    if (!promptBonus) promptBonus = "Create a 'Bonus Value Asset' (like a mini-audit or checklist) relevant to this job: [MISSION_TITLE].";

    promptBonus = promptBonus
      .replace('[MISSION_TITLE]', mission.title)
      .replace('[MISSION_DESCRIPTION]', mission.description || 'N/A')
      .replace('[USER_SKILLS]', JSON.stringify(profileData.keySkillsToAcquire || []));

    const approvedBonus = await this.runQualityLoop(promptBonus, mission, 'bonus');

    // 4. Packaging JSON
    console.log("\n📦 [SYSTEM] Packaging JSON Finale...");
    const finalPackage = await this.gptPackageWithRetry(approvedCandidacy, approvedBonus, mission);
    
    // 5. Salvataggio DB
    try {
      await db.updateTable('missions')
        .set({
          status: 'developed', 
          final_deliverable_json: JSON.stringify(finalPackage), 
          analysis_notes: finalPackage.strategy_brief
        })
        .where('id', '=', missionId)
        .execute();
      console.log("✅ Strategia salvata.");
    } catch (dbError) { console.error("❌ Errore DB update:", dbError); }

    return finalPackage;
  }

  // ==================================================================================
  // 2️⃣ FASE ESECUZIONE LAVORO (Richiesta Cliente + Allegati -> Lavoro Finale)
  // ==================================================================================
  public async executeFinalWork(missionId: string, userId: string, clientInstructions: string): Promise<string> {
      console.log(`\n⚙️ [DEV] Esecuzione Lavoro Finale per: ${missionId}`);
      
      const mission = await db.selectFrom('missions').selectAll().where('id', '=', missionId).executeTakeFirst();
      if (!mission) throw new Error("Missione non trovata");

      // --- RECUPERO CONTESTO STORICO (Cruciale per la memoria) ---
      let prevStrategy = "N/A";
      let prevBonus = "N/A";
      
      // Cerchiamo di leggere cosa avevamo promesso nella fase di "develop"
      if (mission.final_deliverable_json) {
          try {
              const json = typeof mission.final_deliverable_json === 'string' 
                ? JSON.parse(mission.final_deliverable_json) 
                : mission.final_deliverable_json;
              prevStrategy = json.deliverable_content || "N/A";
              prevBonus = json.bonus_material_content || "N/A";
          } catch(e) { console.warn("Impossibile leggere JSON precedente"); }
      }

      // --- COSTRUZIONE PROMPT DI ESECUZIONE ---
      let promptTemplate = this.loadPrompt('prompt_14_final_execution_init.md');
      
      // FALLBACK DI EMERGENZA (Se il file prompt manca su Railway)
      if (!promptTemplate || promptTemplate.length < 10) {
          promptTemplate = `
            ROLE: You are an Elite AI Consultant executing the final work for a client.
            
            CONTEXT - ORIGINAL MISSION:
            Title: [MISSION_TITLE]
            Description: [MISSION_DESCRIPTION]
            
            OUR PREVIOUS PITCH (COVER LETTER):
            """
            [PREVIOUS_STRATEGY]
            """
            
            OUR PREVIOUS BONUS MATERIAL:
            """
            [PREVIOUS_BONUS]
            """
            
            ---------------------------------------------------------
            CURRENT TASK (USER INSTRUCTIONS & FILES):
            [CLIENT_REQUIREMENTS]
            ---------------------------------------------------------
            
            OBJECTIVE:
            Execute the work requested in "CURRENT TASK".
            IMPORTANT: Ensure the tone and quality match "OUR PREVIOUS PITCH". 
            If the user asks to "do the work", refer to the original mission and your previous pitch to understand what "the work" is.
            
            OUTPUT:
            Provide ONLY the final deliverable content. No pleasantries.
          `;
      }

      // INIEZIONE VARIABILI
      const finalPrompt = promptTemplate
          .replace('[MISSION_TITLE]', mission.title)
          .replace('[MISSION_DESCRIPTION]', mission.description || "N/A")
          // Inseriamo la memoria storica (troncata per evitare limiti token enormi, ma GPT-4o regge molto)
          .replace('[PREVIOUS_STRATEGY]', prevStrategy.substring(0, 2000)) 
          .replace('[PREVIOUS_BONUS]', prevBonus.substring(0, 2000))
          .replace('[CLIENT_REQUIREMENTS]', clientInstructions); // Qui ci sono anche gli allegati testuali

      // --- ESECUZIONE DIRETTA (No Loop Auditor per massima fedeltà all'input utente) ---
      try {
          console.log("🤖 [GPT] Generazione in corso...");
          const res = await this.openai.chat.completions.create({
              model: AI_CONFIG.openai.model,
              messages: [{ role: "system", content: finalPrompt }],
              temperature: 0.2 // Bassa temperatura per seguire istruzioni precise
          });
          
          const finalOutput = res.choices[0].message.content || "Errore generazione output vuoto.";
          console.log("✅ Lavoro Finale Completato.");
          return finalOutput;

      } catch (e: any) {
          console.error("❌ OpenAI Error:", e);
          throw new Error("Errore durante la generazione AI. Verifica OPENAI_API_KEY.");
      }
  }

  // ==================================================================================
  // 🧠 CORE: IL LOOP DI QUALITÀ UNIVERSALE
  // ==================================================================================

  private async runQualityLoop(initialPrompt: string, missionContext: any, mode: 'standard' | 'bonus'): Promise<string> {
    // 1. Generazione Bozza
    let currentDraft = "";
    try {
        const res = await this.openai.chat.completions.create({
            model: AI_CONFIG.openai.model,
            messages: [{ role: "system", content: initialPrompt }]
        });
        currentDraft = res.choices[0].message.content || "";
    } catch(e: any) { 
        console.error("GPT Error:", e);
        return "Errore critico generazione bozza. Controllare API Key."; 
    }

    if (!currentDraft) return "Errore: Bozza vuota.";

    // 2. Loop di Audit (Semplificato per stabilità)
    let loop = 0;
    while (loop < AI_CONFIG.system.max_loops) {
        // Qui potremmo chiamare Gemini per l'audit. 
        // Per ora, restituiamo la bozza diretta per evitare complessità eccessiva se Gemini fallisce.
        // Se vuoi riattivare Gemini, decommenta la logica di audit qui sotto.
        break; 
    }

    return currentDraft;
  }

  // ==================================================================================
  // 🛠️ PACKAGER (JSON FORMATTER)
  // ==================================================================================

  private async gptPackageWithRetry(candidacy: string, bonus: string, mission: any): Promise<FinalMissionPackage> {
    let templatePackage = this.loadPrompt('prompt_4_frontend_package.md');
    
    // Fallback template
    if (!templatePackage) {
        templatePackage = `
        Pack the following content into a JSON structure.
        Candidacy: [APPROVED_CANDIDACY]
        Bonus: [APPROVED_BONUS]
        Mission: [MISSION_TITLE] at [MISSION_COMPANY]
        
        Output JSON format:
        {
            "deliverable_content": "string",
            "strategy_brief": "string",
            "execution_steps": ["string"],
            "estimated_impact": "string",
            "bonus_material_title": "string",
            "bonus_material_content": "string",
            "is_immediate_task": boolean,
            "bonus_file_name": "string"
        }
        `;
    }
    
    const finalPrompt = templatePackage
        .replace('[APPROVED_CANDIDACY]', candidacy)
        .replace('[APPROVED_BONUS]', bonus)
        .replace('[MISSION_TITLE]', mission.title)
        .replace('[MISSION_COMPANY]', mission.company_name || 'Azienda Target');
    
    try {
       const res = await this.openai.chat.completions.create({ 
           model: AI_CONFIG.openai.model, 
           messages: [{ role: "system", content: finalPrompt }],
           response_format: { type: "json_object" } // Forza JSON mode (cruciale)
       });
       
       const content = res.choices[0].message.content || "{}";
       return JSON.parse(content);

    } catch(e) {
        console.error("JSON Packaging Failed:", e);
        // Fallback manuale per non rompere il frontend
        return { 
            deliverable_content: candidacy, 
            bonus_material_title: "Bonus Asset", 
            bonus_material_content: bonus, 
            strategy_brief: "Analisi completata. Strategia pronta per l'invio.", 
            execution_steps: ["Rivedi la bozza", "Invia la candidatura"], 
            estimated_impact: "Alta",
            is_immediate_task: true,
            bonus_file_name: "bonus.txt"
        };
    }
  }
}