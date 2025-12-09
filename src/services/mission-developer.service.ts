import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { db } from '../infra/db';

// ==================================================================================
// ⚙️ CONFIGURAZIONE MODELLI AI (AGGIORNATA)
// ==================================================================================
const AI_CONFIG = {
  openai: {
    // Il "Braccio" Operativo - Modello più recente per massima precisione JSON
    model: 'gpt-5.1-chat-latest', 
  },
  gemini: {
    // La "Mente" di Controllo (Auditor)
    model: 'gemini-2.5-pro', 
    generationConfig: {
      temperature: 0.1, // Freddo e preciso per l'analisi
      maxOutputTokens: 16384 
    }
  },
  system: {
    max_loops: 3, // Giri massimi di correzione (Ping-pong GPT <> Gemini)
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
    if (!geminiKey) console.warn("⚠️ GEMINI_API_KEY mancante! Il sistema di audit non funzionerà.");
    
    this.geminiClient = new GoogleGenerativeAI(geminiKey);
    this.geminiModel = this.geminiClient.getGenerativeModel({ 
      model: AI_CONFIG.gemini.model,
      generationConfig: AI_CONFIG.gemini.generationConfig
    });
    
    // Gestione Path per Produzione (dist) vs Sviluppo (src)
    const isProd = process.env.NODE_ENV === 'production';
    this.kbPath = isProd 
      ? path.join(process.cwd(), 'dist', 'knowledge_base')
      : path.join(process.cwd(), 'src', 'knowledge_base');
  }

  // Helper per caricare i prompt dai file .md in modo robusto
  private loadPrompt(filename: string): string {
    try {
      let filePath = path.join(this.kbPath, filename);
      
      // Tentativi di fallback per trovare il file (Root vs Subdir)
      if (!fs.existsSync(filePath)) {
          // Prova nella sottocartella 'developer'
          filePath = path.join(this.kbPath, 'developer', filename);
      }
      if (!fs.existsSync(filePath)) {
          // Fallback assoluto src/knowledge_base (Dev Mode)
          filePath = path.join(process.cwd(), 'src', 'knowledge_base', filename);
      }
      if (!fs.existsSync(filePath)) {
          // Fallback assoluto src/knowledge_base/developer (Dev Mode)
          filePath = path.join(process.cwd(), 'src', 'knowledge_base', 'developer', filename);
      }
      
      return fs.readFileSync(filePath, 'utf-8');
    } catch (e) {
      console.warn(`⚠️ Prompt file mancante: ${filename}`);
      return ""; // Fallback gestito nel codice
    }
  }

  // ==================================================================================
  // 1️⃣ LAYOUT 2: SVILUPPO STRATEGIA (ROUTING INTELLIGENTE)
  // ==================================================================================
  public async developStrategy(missionId: string): Promise<FinalMissionPackage> {
    console.log(`\n⚙️ [DEV] Sviluppo Strategia: ${missionId}`);
    
    // 1. Recupero Missione e Profilo
    const mission = await db.selectFrom('missions').selectAll().where('id', '=', missionId).executeTakeFirst();
    if (!mission) throw new Error("Missione non trovata");

    let profileData: any = {};
    if (mission.user_id) {
        const profile = await db.selectFrom('user_ai_profile').select('career_manifesto').where('user_id', '=', mission.user_id).executeTakeFirst();
        profileData = profile?.career_manifesto || {};
    }

    const userSkills = JSON.stringify(profileData.keySkillsToAcquire || []);
    const userAdvantages = JSON.stringify(profileData.unfairAdvantages || []);

    // 2. SELEZIONE FILE PROMPT BASATA SUL TIPO (ROUTING)
    // Default: Daily (Quick Win)
    let candFile = 'prompt_1_gpt_developer_init.md'; 
    let bonusFile = 'prompt_10_bonus_material_init.md'; 

    if (mission.type === 'weekly') {
        candFile = 'prompt_1_weekly_candidacy.md';
        bonusFile = 'prompt_10_weekly_bonus.md';
        console.log("👉 Using WEEKLY Protocol (Sprint Leader)");
    } else if (mission.type === 'monthly') {
        candFile = 'prompt_1_monthly_candidacy.md';
        bonusFile = 'prompt_10_monthly_bonus.md';
        console.log("👉 Using MONTHLY Protocol (Strategic Partner)");
    } else {
        console.log("👉 Using DAILY Protocol (Problem Solver)");
    }

    // A. Generazione Candidatura (Cover Letter)
    let promptCandidacy = this.loadPrompt(candFile) || "Generate professional proposal.";
    promptCandidacy = promptCandidacy
      .replace('[MISSION_TITLE]', mission.title)
      .replace('[MISSION_DESCRIPTION]', mission.description || 'N/A')
      .replace('[MISSION_URL]', mission.source_url || 'N/A')
      .replace('[USER_SKILLS]', userSkills)
      .replace('[USER_ADVANTAGES]', userAdvantages);

    const approvedCandidacy = await this.simpleGptCall(promptCandidacy);

    // B. Generazione Bonus Asset (Checklist/Roadmap)
    let promptBonus = this.loadPrompt(bonusFile) || "Generate bonus asset.";
    promptBonus = promptBonus
      .replace('[MISSION_TITLE]', mission.title)
      .replace('[MISSION_DESCRIPTION]', mission.description || 'N/A')
      .replace('[USER_SKILLS]', userSkills); // Importante: Passare le skill anche al bonus

    const approvedBonus = await this.simpleGptCall(promptBonus);

    // C. Packaging JSON (Formatta tutto per il Frontend)
    const finalPackage = await this.gptPackageWithRetry(approvedCandidacy, approvedBonus, mission);
    
    // D. Salvataggio nel Database
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
  // 2️⃣ LAYOUT 3: ESECUZIONE STEP-BY-STEP (CHAT MODE)
  // ==================================================================================
  public async executeChatStep(missionId: string, userId: string, userInput: string, attachments: any[] = []): Promise<string> {
      console.log(`\n💬 [EXEC] Chat Step (Mode: ${AI_CONFIG.openai.model}) per Missione: ${missionId}`);

      // 1. RECUPERO MISSIONE, STORIA E LIMITI
      const mission = await db.selectFrom('missions')
        .select(['id', 'title', 'description', 'final_deliverable_json', 'conversation_history', 'command_count', 'max_commands', 'type'])
        .where('id', '=', missionId)
        .executeTakeFirst();

      if (!mission) throw new Error("Missione non trovata.");

      const currentStep = (mission.command_count || 0) + 1;
      const maxSteps = mission.max_commands || 20;
      
      // Controllo Game Over
      if (currentStep > maxSteps) {
          return "⛔ LIMITE MISSIONE RAGGIUNTO. Non è possibile procedere oltre. Si prega di archiviare la missione.";
      }

      // 2. PARSING STORIA CONVERSAZIONE
      let history: any[] = [];
      if (typeof mission.conversation_history === 'string') {
          history = JSON.parse(mission.conversation_history);
      } else if (Array.isArray(mission.conversation_history)) {
          history = mission.conversation_history;
      }

      // 3. PREPARAZIONE INPUT (Testo + Allegati)
      let inputWithAttachments = userInput;
      if (attachments && attachments.length > 0) {
          inputWithAttachments += `\n\n--- [SYSTEM: USER ATTACHMENTS] ---\n`;
          attachments.forEach((file, idx) => {
              // Tronchiamo i file testuali enormi per sicurezza
              const contentPreview = file.content.length > 50000 ? file.content.substring(0, 50000) + "... [TRUNCATED]" : file.content;
              inputWithAttachments += `FILE ${idx+1} (${file.name}):\n${contentPreview}\n----------------\n`;
          });
      }

      // 4. RECUPERO MEMORIA STRATEGICA (Pacing Guide)
      const pacingGuide = this.loadPrompt('guide_execution_pacing.md');
      
      let promiseContext = "";
      try {
          const deliverable = typeof mission.final_deliverable_json === 'string' 
            ? JSON.parse(mission.final_deliverable_json) 
            : mission.final_deliverable_json;
          promiseContext = deliverable?.deliverable_content || "N/A";
      } catch(e) {}

      // 5. SYSTEM PROMPT AVANZATO (Project Manager)
      const systemPrompt = `
      ROLE: You are the Lead AI Developer/Consultant using ${AI_CONFIG.openai.model}.
      
      --- MISSION CONTEXT ---
      Title: ${mission.title}
      Type: ${mission.type?.toUpperCase()}
      Progress: Step ${currentStep} of ${maxSteps}
      Original Promise (Cover Letter): "${promiseContext.substring(0, 800)}..."
      
      --- PACING GUIDE (TIMELINE MANAGER) ---
      ${pacingGuide}
      
      --- INSTRUCTIONS ---
      1. ANALYZE the current phase based on Step count.
      2. EXECUTE the user request. Do not just plan, DO IT (Write code, draft content, etc.).
      3. IF INPUT IS VAGUE: Deduce the next logical step from the "Original Promise" and execute it. Do NOT refuse to work.
      4. MAINTAIN CONTEXT from previous messages.
      `;

      // 6. ESECUZIONE DEL LOOP DI QUALITÀ (GPT -> Gemini -> GPT)
      const recentHistory = history.slice(-12); 
      const finalResponse = await this.runExecutionLoop(systemPrompt, recentHistory, inputWithAttachments);

      // 7. AGGIORNAMENTO DB
      const newMessageUser = { role: "user", content: inputWithAttachments, timestamp: new Date() };
      const newMessageAI = { role: "assistant", content: finalResponse, timestamp: new Date() };
      
      const updatedHistory = [...history, newMessageUser, newMessageAI];

      await db.updateTable('missions')
        .set({
            conversation_history: JSON.stringify(updatedHistory),
            final_work_content: finalResponse, // Aggiorna il display principale
            command_count: currentStep,
            // Status: completed solo se arriviamo alla fine dei passi
            status: currentStep >= maxSteps ? 'completed' : 'active'
        })
        .where('id', '=', missionId)
        .execute();

      return finalResponse;
  }

  // ==================================================================================
  // 🧠 CORE LOOP: GPT ESEGUE <-> GEMINI CONTROLLA
  // ==================================================================================
  private async runExecutionLoop(systemPrompt: string, history: any[], userInput: string): Promise<string> {
      let currentDraft = "";
      let loopCount = 0;
      let approved = false;

      // Inizializza i messaggi per GPT
      const messagesForGPT = [
          { role: "system", content: systemPrompt },
          ...history.map(h => ({ role: h.role, content: h.content })), 
          { role: "user", content: userInput }
      ];

      while (loopCount <= AI_CONFIG.system.max_loops && !approved) {
          loopCount++;
          console.log(`   🔄 [LOOP ${loopCount}] GPT Generazione...`);

          // A. GPT Genera (Esecutore)
          try {
              const res = await this.openai.chat.completions.create({
                  model: AI_CONFIG.openai.model, // gpt-5.1-chat-latest
                  messages: messagesForGPT as any,
                  temperature: 0.3 // Preciso ma creativo
              });
              currentDraft = res.choices[0].message.content || "Errore generazione.";
          } catch (e: any) {
              console.error("OpenAI Error:", e);
              return "Errore critico API OpenAI. Verificare chiave o disponibilità modello.";
          }

          // Se è una risposta molto breve ("Ok, ecco fatto"), o abbiamo finito i loop, usciamo
          if (currentDraft.length < 50 || loopCount > AI_CONFIG.system.max_loops) {
              approved = true;
              break;
          }

          // B. Gemini Controlla (Auditor)
          console.log(`   ⚖️ [LOOP ${loopCount}] Gemini Audit...`);
          try {
              const auditPrompt = `
              ROLE: Strict Quality Assurance Auditor (Using ${AI_CONFIG.gemini.model}).
              
              USER REQUEST: 
              "${userInput.substring(0, 2000)}..."
              
              AI DRAFT RESPONSE: 
              "${currentDraft.substring(0, 10000)}..."
              
              TASK:
              Evaluate the AI Draft.
              1. Does it FULLY address the user request?
              2. Did it refuse to work ("I can't do that")? -> FAIL.
              3. Is the quality high?
              
              OUTPUT JSON ONLY:
              { "approved": boolean, "critique": "Specific instruction to fix the draft (empty if approved)" }
              `;

              const auditRes = await this.geminiModel.generateContent(auditPrompt);
              const auditJson = this.safeJsonParse(auditRes.response.text());

              if (auditJson && auditJson.approved) {
                  console.log("   ✅ Gemini approva.");
                  approved = true;
              } else if (auditJson) {
                  console.log(`   ❌ Gemini rifiuta: ${auditJson.critique}`);
                  // Reinseriamo la critica nel contesto di GPT per il prossimo giro
                  messagesForGPT.push({ role: "assistant", content: currentDraft });
                  messagesForGPT.push({ role: "system", content: `CRITICAL FEEDBACK FROM AUDITOR: "${auditJson.critique}". \n\nRE-WRITE the previous response to address this feedback perfectly.` });
              } else {
                  // Fallback se il JSON di Gemini è rotto
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
        // Fallback di sicurezza in caso di errore di parsing JSON
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