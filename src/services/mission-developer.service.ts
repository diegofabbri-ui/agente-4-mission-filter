import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { db } from '../infra/db';

// ==================================================================================
// ⚙️ CONFIGURAZIONE MODELLI AI (GENIUS MODE ACTIVE)
// ==================================================================================
const AI_CONFIG = {
  openai: {
    // Il "Braccio" Operativo - Aggiornato al modello top di gamma per output "Genius"
    model: 'gpt-5.2-pro', 
  },
  gemini: {
    // La "Mente" di Controllo (Auditor) - Invariato per stabilità
    model: 'gemini-2.5-pro', 
    generationConfig: {
      temperature: 0.1, // Freddo e spietato nel trovare errori
      maxOutputTokens: 16384 
    }
  },
  system: {
    max_loops: 3, // Tentativi di auto-correzione prima di forzare l'output
  }
};

// Interfacce Output
export interface FinalMissionPackage {
  deliverable_content: string;
  strategy_brief: string;
  execution_steps: string[];
  estimated_impact: string;
  bonus_material_title: string;
  bonus_material_content: string;
  is_immediate_task: boolean;
  bonus_file_name: string;
}

export class MissionDeveloperService {
  private openai: OpenAI;
  private geminiClient: GoogleGenerativeAI;
  private geminiModel: any;
  private kbPath: string;

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const geminiKey = process.env.GEMINI_API_KEY || '';
    if (!geminiKey) console.warn("⚠️ GEMINI_API_KEY mancante! Il sistema di audit QA sarà disabilitato.");
    
    this.geminiClient = new GoogleGenerativeAI(geminiKey);
    this.geminiModel = this.geminiClient.getGenerativeModel({ 
      model: AI_CONFIG.gemini.model,
      generationConfig: AI_CONFIG.gemini.generationConfig
    });
    
    // Gestione Path resiliente (Produzione vs Sviluppo)
    const isProd = process.env.NODE_ENV === 'production';
    this.kbPath = isProd 
      ? path.join(process.cwd(), 'dist', 'knowledge_base')
      : path.join(process.cwd(), 'src', 'knowledge_base');
  }

  // Helper per caricare i prompt dai file .md in modo robusto
  private loadPrompt(filename: string): string {
    try {
      let filePath = path.join(this.kbPath, filename);
      
      // Tentativi di fallback per trovare il file
      if (!fs.existsSync(filePath)) {
          filePath = path.join(this.kbPath, 'developer', filename);
      }
      if (!fs.existsSync(filePath)) {
          filePath = path.join(process.cwd(), 'src', 'knowledge_base', filename);
      }
      
      return fs.readFileSync(filePath, 'utf-8');
    } catch (e) {
      console.warn(`⚠️ Prompt file mancante: ${filename}`);
      return "";
    }
  }

  // ==================================================================================
  // 1️⃣ FASE STRATEGICA: IL "GENIUS PITCH" (Candidatura + Bonus)
  // ==================================================================================
  public async developStrategy(missionId: string): Promise<FinalMissionPackage> {
    console.log(`\n⚙️ [DEV] Avvio Elaborazione Strategia (Genius Mode): ${missionId}`);
    
    // 1. Recupero Missione e Profilo Utente
    const mission = await db.selectFrom('missions').selectAll().where('id', '=', missionId).executeTakeFirst();
    if (!mission) throw new Error("Missione non trovata");

    let profileData: any = {};
    if (mission.user_id) {
        const profile = await db.selectFrom('user_ai_profile').select('career_manifesto').where('user_id', '=', mission.user_id).executeTakeFirst();
        profileData = profile?.career_manifesto || {};
    }

    const userSkills = JSON.stringify(profileData.keySkillsToAcquire || []);
    const userAdvantages = JSON.stringify(profileData.unfairAdvantages || []);

    // 2. ROUTING INTELLIGENTE DEI PROMPT (Daily vs Weekly vs Monthly)
    // Selezioniamo il "Persona" giusto per il tipo di missione
    let candFile = 'prompt_1_gpt_developer_init.md'; // Default: Daily (The Fixer)
    let bonusFile = 'prompt_10_bonus_material_init.md'; 

    if (mission.type === 'weekly') {
        candFile = 'prompt_1_weekly_candidacy.md'; // The Sprint Leader
        bonusFile = 'prompt_10_weekly_bonus.md';
        console.log("👉 Attivazione Protocollo WEEKLY (Sprint Leader)");
    } else if (mission.type === 'monthly') {
        candFile = 'prompt_1_monthly_candidacy.md'; // The Strategic Partner
        bonusFile = 'prompt_10_monthly_bonus.md';
        console.log("👉 Attivazione Protocollo MONTHLY (Visionary)");
    } else {
        console.log("👉 Attivazione Protocollo DAILY (Problem Solver)");
    }

    // A. Generazione Candidatura "Genius" (Over-Delivery immediata)
    let promptCandidacy = this.loadPrompt(candFile) || "Generate high-value proposal.";
    promptCandidacy = promptCandidacy
      .replace('[MISSION_TITLE]', mission.title)
      .replace('[MISSION_DESCRIPTION]', mission.description || 'N/A')
      .replace('[MISSION_URL]', mission.source_url || 'N/A')
      .replace('[USER_SKILLS]', userSkills)
      .replace('[USER_ADVANTAGES]', userAdvantages); // Chiave per il "Marchio di Fabbrica"

    const approvedCandidacy = await this.simpleGptCall(promptCandidacy);

    // B. Generazione Bonus Asset "Shock & Awe" (Diagnosi o Roadmap)
    let promptBonus = this.loadPrompt(bonusFile) || "Generate bonus asset.";
    promptBonus = promptBonus
      .replace('[MISSION_TITLE]', mission.title)
      .replace('[MISSION_DESCRIPTION]', mission.description || 'N/A')
      .replace('[USER_SKILLS]', userSkills);

    const approvedBonus = await this.simpleGptCall(promptBonus);

    // C. Packaging JSON (Unione dei pezzi per il Frontend)
    const finalPackage = await this.gptPackageWithRetry(approvedCandidacy, approvedBonus, mission);
    
    // D. Salvataggio Persistente
    await db.updateTable('missions')
      .set({
        status: 'developed', 
        final_deliverable_json: JSON.stringify(finalPackage), 
        analysis_notes: finalPackage.strategy_brief
      })
      .where('id', '=', missionId)
      .execute();

    return finalPackage;
  }

  // ==================================================================================
  // 2️⃣ FASE ESECUTIVA: CHAT OPERATIVA (Project Management)
  // ==================================================================================
  public async executeChatStep(missionId: string, userId: string, userInput: string, attachments: any[] = []): Promise<string> {
      console.log(`\n💬 [EXEC] Chat Step (Mode: ${AI_CONFIG.openai.model}) per Missione: ${missionId}`);

      // 1. Recupero contesto
      const mission = await db.selectFrom('missions')
        .select(['id', 'title', 'description', 'final_deliverable_json', 'conversation_history', 'command_count', 'max_commands', 'type'])
        .where('id', '=', missionId)
        .executeTakeFirst();

      if (!mission) throw new Error("Missione non trovata.");

      const currentStep = (mission.command_count || 0) + 1;
      const maxSteps = mission.max_commands || 20;
      
      if (currentStep > maxSteps) return "⛔ LIMITE MISSIONE RAGGIUNTO. Si prega di archiviare.";

      // 2. Parsing storia
      let history: any[] = [];
      if (typeof mission.conversation_history === 'string') {
          history = JSON.parse(mission.conversation_history);
      } else if (Array.isArray(mission.conversation_history)) {
          history = mission.conversation_history;
      }

      // 3. Preparazione Input con Allegati
      let inputWithAttachments = userInput;
      if (attachments && attachments.length > 0) {
          inputWithAttachments += `\n\n--- [SYSTEM: USER ATTACHMENTS] ---\n`;
          attachments.forEach((file, idx) => {
              const contentPreview = file.content.length > 50000 ? file.content.substring(0, 50000) + "... [TRUNCATED]" : file.content;
              inputWithAttachments += `FILE ${idx+1} (${file.name}):\n${contentPreview}\n----------------\n`;
          });
      }

      // 4. Recupero Guida "Pacing" (Gestione del tempo di progetto)
      const pacingGuide = this.loadPrompt('guide_execution_pacing.md');
      
      let promiseContext = "";
      try {
          const deliverable = typeof mission.final_deliverable_json === 'string' 
            ? JSON.parse(mission.final_deliverable_json) 
            : mission.final_deliverable_json;
          promiseContext = deliverable?.deliverable_content || "N/A";
      } catch(e) {}

      // 5. System Prompt "Lead Engineer"
      const systemPrompt = `
      ROLE: You are the Lead Genius Developer/Consultant using ${AI_CONFIG.openai.model}.
      
      --- MISSION CONTEXT ---
      Title: ${mission.title}
      Type: ${mission.type?.toUpperCase()}
      Progress: Step ${currentStep} of ${maxSteps}
      Original Promise (Cover Letter): "${promiseContext.substring(0, 800)}..."
      
      --- PACING GUIDE ---
      ${pacingGuide}
      
      --- GENIUS INSTRUCTIONS ---
      1. **OVER-DELIVER:** Always format output cleanly. Use ASCII tables, code blocks, or bold text for clarity.
      2. **EXECUTE:** Don't just plan. Do the work. Write the code. Draft the email.
      3. **AUTHORITY:** Speak as a peer expert, not a servant.
      `;

      // 6. Esecuzione Loop (GPT -> Gemini -> GPT)
      const recentHistory = history.slice(-12); 
      const finalResponse = await this.runExecutionLoop(systemPrompt, recentHistory, inputWithAttachments);

      // 7. Aggiornamento DB
      const newMessageUser = { role: "user", content: inputWithAttachments, timestamp: new Date() };
      const newMessageAI = { role: "assistant", content: finalResponse, timestamp: new Date() };
      const updatedHistory = [...history, newMessageUser, newMessageAI];

      await db.updateTable('missions')
        .set({
            conversation_history: JSON.stringify(updatedHistory),
            final_work_content: finalResponse,
            command_count: currentStep,
            status: currentStep >= maxSteps ? 'completed' : 'active'
        })
        .where('id', '=', missionId)
        .execute();

      return finalResponse;
  }

  // ==================================================================================
  // 🧠 CORE LOOP: GPT (GENIO) <-> GEMINI (AUDITOR)
  // ==================================================================================
  private async runExecutionLoop(systemPrompt: string, history: any[], userInput: string): Promise<string> {
      let currentDraft = "";
      let loopCount = 0;
      let approved = false;

      const messagesForGPT = [
          { role: "system", content: systemPrompt },
          ...history.map(h => ({ role: h.role, content: h.content })), 
          { role: "user", content: userInput }
      ];

      while (loopCount <= AI_CONFIG.system.max_loops && !approved) {
          loopCount++;
          console.log(`   🔄 [LOOP ${loopCount}] GPT (${AI_CONFIG.openai.model}) Generazione...`);

          try {
              const res = await this.openai.chat.completions.create({
                  model: AI_CONFIG.openai.model, 
                  messages: messagesForGPT as any,
                  temperature: 0.3 
              });
              currentDraft = res.choices[0].message.content || "Errore generazione.";
          } catch (e: any) {
              console.error("OpenAI Error:", e);
              return "Errore critico API OpenAI. Verificare chiave.";
          }

          if (currentDraft.length < 50 || loopCount > AI_CONFIG.system.max_loops) {
              approved = true;
              break;
          }

          console.log(`   ⚖️ [LOOP ${loopCount}] Gemini Audit...`);
          try {
              const auditPrompt = `
              ROLE: Strict Quality Assurance Auditor (Using ${AI_CONFIG.gemini.model}).
              TASK: Evaluate the AI Draft.
              1. Does it FULLY address the user request?
              2. Is the tone professional and authoritative?
              
              USER REQUEST: "${userInput.substring(0, 1000)}..."
              DRAFT: "${currentDraft.substring(0, 5000)}..."
              
              OUTPUT JSON: { "approved": boolean, "critique": "Specific feedback" }
              `;

              const auditRes = await this.geminiModel.generateContent(auditPrompt);
              const auditJson = this.safeJsonParse(auditRes.response.text());

              if (auditJson && auditJson.approved) {
                  approved = true;
              } else if (auditJson) {
                  console.log(`   ❌ Gemini rifiuta: ${auditJson.critique}`);
                  messagesForGPT.push({ role: "assistant", content: currentDraft });
                  messagesForGPT.push({ role: "system", content: `AUDITOR FEEDBACK: "${auditJson.critique}". RE-WRITE to fix this.` });
              } else {
                  approved = true; 
              }

          } catch (e) {
              console.warn("⚠️ Gemini Audit Error (Skipping audit):", e);
              approved = true;
          }
      }

      return currentDraft;
  }

  // ==================================================================================
  // UTILS
  // ==================================================================================
  private async simpleGptCall(prompt: string): Promise<string> {
      try {
          const res = await this.openai.chat.completions.create({
              model: AI_CONFIG.openai.model,
              messages: [{ role: "system", content: prompt }]
          });
          return res.choices[0].message.content || "";
      } catch (e) { return ""; }
  }

  private async gptPackageWithRetry(candidacy: string, bonus: string, mission: any): Promise<FinalMissionPackage> {
    const templatePackage = this.loadPrompt('prompt_4_frontend_package.md') || "Package content into JSON.";
    
    const finalPrompt = templatePackage
        .replace('[APPROVED_CANDIDACY]', candidacy)
        .replace('[APPROVED_BONUS]', bonus)
        .replace('[MISSION_TITLE]', mission.title)
        .replace('[MISSION_COMPANY]', mission.company_name || 'Client');
    
    try {
       const res = await this.openai.chat.completions.create({ 
           model: AI_CONFIG.openai.model, 
           messages: [{ role: "system", content: finalPrompt }],
           response_format: { type: "json_object" }
       });
       return JSON.parse(res.choices[0].message.content || "{}");
    } catch(e) {
        return { 
            deliverable_content: candidacy, 
            bonus_material_title: "Bonus Asset Strategico", 
            bonus_material_content: bonus, 
            strategy_brief: "Strategia pronta. Bonus generato.", 
            execution_steps: ["1. Copia la candidatura", "2. Allega il bonus", "3. Invia email"], 
            estimated_impact: "Alto", 
            is_immediate_task: true, 
            bonus_file_name: "Bonus_Asset.pdf" 
        };
    }
  }

  private safeJsonParse(text: string): any {
    try {
      let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const start = clean.indexOf('{');
      const end = clean.lastIndexOf('}');
      if (start !== -1 && end !== -1) clean = clean.substring(start, end + 1);
      return JSON.parse(clean);
    } catch (e) { return null; }
  }
}