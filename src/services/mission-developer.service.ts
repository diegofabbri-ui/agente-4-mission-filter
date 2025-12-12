import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { db } from '../infra/db';

// ==================================================================================
// ⚙️ CONFIGURAZIONE MODELLI AI (GENIUS MODE)
// ==================================================================================
const AI_CONFIG = {
  openai: {
    // MODELLO AGGIORNATO COME RICHIESTO
    model: 'gpt-5.1-chat-latest', 
  },
  gemini: {
    // La "Mente" di Controllo (Auditor)
    model: 'gemini-2.5-pro', 
    generationConfig: {
      temperature: 0.1, 
      maxOutputTokens: 16384 
    }
  },
  system: {
    max_loops: 3,
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
    
    const isProd = process.env.NODE_ENV === 'production';
    this.kbPath = isProd 
      ? path.join(process.cwd(), 'dist', 'knowledge_base')
      : path.join(process.cwd(), 'src', 'knowledge_base');
  }

  private loadPrompt(filename: string): string {
    try {
      let filePath = path.join(this.kbPath, filename);
      if (!fs.existsSync(filePath)) filePath = path.join(this.kbPath, 'developer', filename);
      if (!fs.existsSync(filePath)) filePath = path.join(process.cwd(), 'src', 'knowledge_base', filename);
      return fs.readFileSync(filePath, 'utf-8');
    } catch (e) {
      console.warn(`⚠️ Prompt file mancante: ${filename}`);
      return "";
    }
  }

  // ==================================================================================
  // 1️⃣ FASE STRATEGICA: IL "GENIUS PITCH"
  // ==================================================================================
  public async developStrategy(missionId: string): Promise<FinalMissionPackage> {
    console.log(`\n⚙️ [DEV] Avvio Elaborazione Strategia (Genius Mode - ${AI_CONFIG.openai.model}): ${missionId}`);
    
    const mission = await db.selectFrom('missions').selectAll().where('id', '=', missionId).executeTakeFirst();
    if (!mission) throw new Error("Missione non trovata");

    let profileData: any = {};
    if (mission.user_id) {
        const profile = await db.selectFrom('user_ai_profile').select('career_manifesto').where('user_id', '=', mission.user_id).executeTakeFirst();
        profileData = profile?.career_manifesto || {};
    }

    const userSkills = JSON.stringify(profileData.keySkillsToAcquire || []);
    const userAdvantages = JSON.stringify(profileData.unfairAdvantages || []);

    // ROUTING
    let candFile = 'prompt_1_gpt_developer_init.md'; 
    let bonusFile = 'prompt_10_bonus_material_init.md'; 

    if (mission.type === 'weekly') {
        candFile = 'prompt_1_weekly_candidacy.md';
        bonusFile = 'prompt_10_weekly_bonus.md';
        console.log("👉 Attivazione Protocollo WEEKLY (Sprint Leader)");
    } else if (mission.type === 'monthly') {
        candFile = 'prompt_1_monthly_candidacy.md';
        bonusFile = 'prompt_10_monthly_bonus.md';
        console.log("👉 Attivazione Protocollo MONTHLY (Visionary)");
    } else {
        console.log("👉 Attivazione Protocollo DAILY (Problem Solver)");
    }

    // A. Generazione Candidatura
    let promptCandidacy = this.loadPrompt(candFile) || "Generate genius proposal.";
    promptCandidacy = promptCandidacy
      .replace('[MISSION_TITLE]', mission.title)
      .replace('[MISSION_DESCRIPTION]', mission.description || 'N/A')
      .replace('[MISSION_URL]', mission.source_url || 'N/A')
      .replace('[USER_SKILLS]', userSkills)
      .replace('[USER_ADVANTAGES]', userAdvantages);

    const approvedCandidacy = await this.simpleGptCall(promptCandidacy);

    // B. Generazione Bonus Asset
    let promptBonus = this.loadPrompt(bonusFile) || "Generate genius bonus.";
    promptBonus = promptBonus
      .replace('[MISSION_TITLE]', mission.title)
      .replace('[MISSION_DESCRIPTION]', mission.description || 'N/A')
      .replace('[USER_SKILLS]', userSkills);

    const approvedBonus = await this.simpleGptCall(promptBonus);

    // C. Packaging
    const finalPackage = await this.gptPackageWithRetry(approvedCandidacy, approvedBonus, mission);
    
    // D. Salvataggio
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
  // UTILS
  // ==================================================================================
  private async simpleGptCall(prompt: string): Promise<string> {
      try {
          const res = await this.openai.chat.completions.create({
              model: AI_CONFIG.openai.model,
              messages: [{ role: "system", content: prompt }]
          });
          const content = res.choices[0].message.content || "";
          if (!content) console.warn("⚠️ GPT ha restituito contenuto vuoto.");
          return content;
      } catch (e: any) { 
          // Log dell'errore specifico
          console.error(`❌ OpenAI API Error [${AI_CONFIG.openai.model}]:`, e.message);
          return `Errore generazione AI (${AI_CONFIG.openai.model}).`; 
      }
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
        console.error("❌ Errore Packaging JSON:", e);
        return { 
            deliverable_content: candidacy || "Errore generazione candidatura.", 
            bonus_material_title: "Bonus Asset", 
            bonus_material_content: bonus || "Errore generazione bonus.", 
            strategy_brief: "Strategia generata con errori.", 
            execution_steps: ["1. Verifica connessione API", "2. Riprova"], 
            estimated_impact: "N/A", 
            is_immediate_task: true, 
            bonus_file_name: "Error.log" 
        };
    }
  }

  public async executeChatStep(missionId: string, userId: string, userInput: string, attachments: any[] = []): Promise<string> {
      console.log(`\n💬 [EXEC] Chat Step (Mode: ${AI_CONFIG.openai.model}) per Missione: ${missionId}`);

      const mission = await db.selectFrom('missions')
        .select(['id', 'title', 'description', 'final_deliverable_json', 'conversation_history', 'command_count', 'max_commands', 'type'])
        .where('id', '=', missionId)
        .executeTakeFirst();

      if (!mission) throw new Error("Missione non trovata.");

      const currentStep = (mission.command_count || 0) + 1;
      const maxSteps = mission.max_commands || 20;
      
      if (currentStep > maxSteps) return "⛔ LIMITE MISSIONE RAGGIUNTO. Archiviare la missione.";

      let history: any[] = [];
      if (typeof mission.conversation_history === 'string') {
          history = JSON.parse(mission.conversation_history);
      } else if (Array.isArray(mission.conversation_history)) {
          history = mission.conversation_history;
      }

      let inputWithAttachments = userInput;
      if (attachments && attachments.length > 0) {
          inputWithAttachments += `\n\n--- [SYSTEM: USER ATTACHMENTS] ---\n`;
          attachments.forEach((file, idx) => {
              const contentPreview = file.content.length > 50000 ? file.content.substring(0, 50000) + "... [TRUNCATED]" : file.content;
              inputWithAttachments += `FILE ${idx+1} (${file.name}):\n${contentPreview}\n----------------\n`;
          });
      }

      const pacingGuide = this.loadPrompt('guide_execution_pacing.md');
      let promiseContext = "";
      try {
          const deliverable = typeof mission.final_deliverable_json === 'string' 
            ? JSON.parse(mission.final_deliverable_json) 
            : mission.final_deliverable_json;
          promiseContext = deliverable?.deliverable_content || "N/A";
      } catch(e) {}

      const systemPrompt = `
      ROLE: You are the Lead Genius Developer/Consultant using ${AI_CONFIG.openai.model}.
      --- MISSION CONTEXT ---
      Title: ${mission.title}
      Type: ${mission.type?.toUpperCase()}
      Progress: Step ${currentStep} of ${maxSteps}
      Original Promise: "${promiseContext.substring(0, 800)}..."
      --- PACING ---
      ${pacingGuide}
      --- INSTRUCTIONS ---
      1. **OVER-DELIVER:** Format cleanly (ASCII, Bold, Code Blocks).
      2. **EXECUTE:** Do the work immediately.
      3. **AUTHORITY:** Peer-to-peer tone.
      `;

      const recentHistory = history.slice(-12); 
      const finalResponse = await this.runExecutionLoop(systemPrompt, recentHistory, inputWithAttachments);

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
              console.error(`OpenAI Error (${AI_CONFIG.openai.model}):`, e.message);
              return `Errore tecnico: Modello ${AI_CONFIG.openai.model} non raggiungibile o errore API.`;
          }

          if (currentDraft.length < 50 || loopCount > AI_CONFIG.system.max_loops) {
              approved = true;
              break;
          }

          console.log(`   ⚖️ [LOOP ${loopCount}] Gemini Audit...`);
          try {
              const auditPrompt = `
              ROLE: Strict QA Auditor.
              TASK: Check if the draft addresses the user request professionally.
              USER: "${userInput.substring(0, 1000)}..."
              DRAFT: "${currentDraft.substring(0, 5000)}..."
              OUTPUT JSON: { "approved": boolean, "critique": "feedback" }
              `;
              const auditRes = await this.geminiModel.generateContent(auditPrompt);
              const auditJson = this.safeJsonParse(auditRes.response.text());
              if (auditJson && auditJson.approved) approved = true;
              else if (auditJson) {
                  messagesForGPT.push({ role: "assistant", content: currentDraft });
                  messagesForGPT.push({ role: "system", content: `AUDITOR FEEDBACK: "${auditJson.critique}". Fix it.` });
              } else approved = true;
          } catch (e) {
              console.warn("⚠️ Gemini Audit Error (Skipping):", e);
              approved = true;
          }
      }
      return currentDraft;
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