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
    model: 'gpt-5.1-chat-latest', // O 'gpt-4o' a seconda della disponibilità
  },
  gemini: {
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
    if (!geminiKey) console.warn("⚠️ GEMINI_API_KEY mancante! Audit QA disabilitato.");
    
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

  // --- HELPER: CARICAMENTO PROMPT ---
  private loadPrompt(filename: string): string {
    try {
      let filePath = path.join(this.kbPath, filename);
      if (!fs.existsSync(filePath)) filePath = path.join(this.kbPath, 'developer', filename);
      if (!fs.existsSync(filePath)) filePath = path.join(process.cwd(), 'src', 'knowledge_base', filename);
      return fs.readFileSync(filePath, 'utf-8');
    } catch (e) {
      console.warn(`⚠️ Prompt mancante: ${filename}`);
      return "";
    }
  }

  // --- HELPER: SOSTITUZIONE TAG GLOBALE ---
  private replaceTags(template: string, data: Record<string, string>): string {
      let result = template;
      for (const [key, value] of Object.entries(data)) {
          // Replace globale di tutte le occorrenze
          result = result.split(key).join(value || "N/A");
      }
      return result;
  }

  // ==================================================================================
  // 1️⃣ FASE STRATEGICA: SVILUPPO CONTEXT-AWARE (LAYOUT 2)
  // ==================================================================================
  public async developStrategy(missionId: string): Promise<FinalMissionPackage> {
    console.log(`\n⚙️ [DEV] Sviluppo Strategia Completa: ${missionId}`);
    
    // 1. Recupero Dati
    const mission = await db.selectFrom('missions').selectAll().where('id', '=', missionId).executeTakeFirst();
    if (!mission) throw new Error("Missione non trovata");

    let profileData: any = {};
    if (mission.user_id) {
        const profile = await db.selectFrom('user_ai_profile').select('career_manifesto').where('user_id', '=', mission.user_id).executeTakeFirst();
        profileData = profile?.career_manifesto || {};
    }

    const userSkills = JSON.stringify(profileData.keySkillsToAcquire || []);
    const userAdvantages = JSON.stringify(profileData.unfairAdvantages || []);

    // 2. Mappa Dati Completa (Context Payload)
    const contextData = {
        '[MISSION_TITLE]': mission.title,
        '[MISSION_DESCRIPTION]': mission.description || "Nessuna descrizione fornita.",
        '[MISSION_URL]': mission.source_url || "N/A",
        '[MISSION_COMPANY]': mission.company_name || "Cliente Confidenziale",
        '[USER_SKILLS]': userSkills,
        '[USER_ADVANTAGES]': userAdvantages,
        '[PLATFORM]': mission.platform || "Web"
    };

    // 3. Routing Prompt
    let candFile = 'prompt_1_gpt_developer_init.md'; 
    let bonusFile = 'prompt_10_bonus_material_init.md'; 

    if (mission.type === 'weekly') {
        candFile = 'prompt_1_weekly_candidacy.md';
        bonusFile = 'prompt_10_weekly_bonus.md';
    } else if (mission.type === 'monthly') {
        candFile = 'prompt_1_monthly_candidacy.md';
        bonusFile = 'prompt_10_monthly_bonus.md';
    }

    // A. Generazione Candidatura
    let rawPromptCand = this.loadPrompt(candFile) || "Generate professional proposal.";
    const finalPromptCand = this.replaceTags(rawPromptCand, contextData);
    const approvedCandidacy = await this.simpleGptCall(finalPromptCand);

    // B. Generazione Bonus Asset (FIX: Ora riceve i dati skill corretti)
    let rawPromptBonus = this.loadPrompt(bonusFile) || "Generate strategic bonus asset.";
    const finalPromptBonus = this.replaceTags(rawPromptBonus, contextData);
    const approvedBonus = await this.simpleGptCall(finalPromptBonus);

    // C. Packaging
    const finalPackage = await this.gptPackageWithRetry(approvedCandidacy, approvedBonus, contextData);
    
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
  // 2️⃣ ESECUZIONE CHAT (AGENTE AUTONOMO - LAYOUT 3)
  // ==================================================================================
  public async executeChatStep(missionId: string, userId: string, userInput: string, attachments: any[] = []): Promise<string> {
      console.log(`\n💬 [EXEC] Chat Step: ${missionId}`);

      // 1. Recupero dati missione
      const mission = await db.selectFrom('missions')
        .select(['id', 'title', 'description', 'final_deliverable_json', 'conversation_history', 'command_count', 'max_commands', 'type', 'raw_data', 'status'])
        .where('id', '=', missionId)
        .executeTakeFirst();

      if (!mission) throw new Error("Missione non trovata.");

      const currentStep = mission.command_count || 0;
      
      // 2. Controllo Stato Completamento
      if (mission.status === 'completed') {
          return "🔒 Missione Archiviata. La memoria è stata resettata. Avvia una nuova missione.";
      }

      // 3. Gestione Allegati nell'Input
      let inputWithAttachments = userInput;
      let attachmentsListStr = "Nessuno";
      if (attachments && attachments.length > 0) {
          inputWithAttachments += `\n\n--- [SYSTEM: USER ATTACHMENTS] ---\n`;
          attachmentsListStr = attachments.map(f => f.name).join(", ");
          attachments.forEach((file, idx) => {
              // Tronchiamo file giganti per non rompere il context window
              const contentPreview = file.content.length > 50000 ? file.content.substring(0, 50000) + "... [TRUNCATED]" : file.content;
              inputWithAttachments += `FILE ${idx+1} (${file.name}):\n${contentPreview}\n----------------\n`;
          });
      }

      // 4. LOGICA BIFORCATA: ARCHITETTO vs OPERAIO
      let finalResponse = "";
      let updatedRawData = typeof mission.raw_data === 'string' ? JSON.parse(mission.raw_data) : (mission.raw_data || {});

      // --- CASO A: PRIMO STEP (ORCHESTRAZIONE) ---
      if (currentStep === 0) {
          console.log("🏗️ [AGENTE] Generazione Piano di Orchestrazione...");
          
          let orchestratorPrompt = this.loadPrompt('prompt_orchestrator.md');
          orchestratorPrompt = orchestratorPrompt
              .replace('{{USER_INPUT}}', userInput)
              .replace('{{ATTACHMENTS_LIST}}', attachmentsListStr);

          // Chiamata AI per generare il piano
          finalResponse = await this.simpleGptCall(orchestratorPrompt);
          
          // SALVIAMO IL PIANO NELLA "MEMORIA A LUNGO TERMINE" (DB)
          updatedRawData.orchestration_plan = finalResponse;
      } 
      
      // --- CASO B: STEP SUCCESSIVI (ESECUZIONE WORKER) ---
      else {
          console.log(`🔨 [AGENTE] Esecuzione Step ${currentStep + 1}...`);
          
          // Recuperiamo il piano dalla memoria DB
          const masterPlan = updatedRawData.orchestration_plan || "⚠️ NESSUN PIANO TROVATO. Procedi con best practice.";
          
          let workerPrompt = this.loadPrompt('prompt_worker.md');
          workerPrompt = workerPrompt
              .replace('{{ORCHESTRATION_PLAN}}', masterPlan)
              .replace('{{USER_INPUT}}', userInput);

          // Recuperiamo la storia della chat (MEMORIA DI CONTESTO)
          let history: any[] = [];
          if (typeof mission.conversation_history === 'string') {
              history = JSON.parse(mission.conversation_history);
          } else if (Array.isArray(mission.conversation_history)) {
              history = mission.conversation_history;
          }

          // Eseguiamo il loop di lavoro con la memoria attiva
          finalResponse = await this.runExecutionLoop(workerPrompt, history.slice(-15), inputWithAttachments);
      }

      // 5. AGGIORNAMENTO MEMORIA E DB
      let history: any[] = [];
      if (typeof mission.conversation_history === 'string') {
          history = JSON.parse(mission.conversation_history);
      } else if (Array.isArray(mission.conversation_history)) {
          history = mission.conversation_history;
      }

      const newMessageUser = { role: "user", content: inputWithAttachments, timestamp: new Date() };
      const newMessageAI = { role: "assistant", content: finalResponse, timestamp: new Date() };
      
      // Appendiamo alla storia
      const updatedHistory = [...history, newMessageUser, newMessageAI];

      // Salviamo tutto
      await db.updateTable('missions')
        .set({
            conversation_history: JSON.stringify(updatedHistory), // Memoria attiva
            raw_data: JSON.stringify(updatedRawData),             // Memoria orchestrale
            final_work_content: finalResponse,                    // Ultimo output per la UI
            command_count: currentStep + 1,
            status: 'active' 
        })
        .where('id', '=', missionId)
        .execute();

      return finalResponse;
  }

  // ==================================================================================
  // 3️⃣ METODI DI CHIUSURA MISSIONE
  // ==================================================================================
  public async completeMission(missionId: string): Promise<void> {
      console.log(`🏁 [MISSION] Completamento e Pulizia: ${missionId}`);
      await db.updateTable('missions')
          .set({
              status: 'completed',
              conversation_history: JSON.stringify([]), // 🗑️ CANCELLA MEMORIA CHAT
              // Nota: Manteniamo raw_data.orchestration_plan per audit, ma la chat è vuota.
          })
          .where('id', '=', missionId)
          .execute();
  }

  // ==================================================================================
  // UTILS
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
          try {
              const res = await this.openai.chat.completions.create({
                  model: AI_CONFIG.openai.model, 
                  messages: messagesForGPT as any,
                  temperature: 0.3 
              });
              currentDraft = res.choices[0].message.content || "";
          } catch (e: any) {
              console.error(`AI Error (${AI_CONFIG.openai.model}):`, e.message);
              return "Errore tecnico generazione.";
          }

          if (currentDraft.length < 50 || loopCount > AI_CONFIG.system.max_loops) {
              approved = true;
              break;
          }

          // Audit Semplificato (Gemini)
          try {
              const auditPrompt = `
              ROLE: QA Auditor.
              REQ: "${userInput.substring(0, 500)}..."
              DRAFT: "${currentDraft.substring(0, 2000)}..."
              OUTPUT JSON: { "approved": boolean, "critique": "string" }
              `;
              const auditRes = await this.geminiModel.generateContent(auditPrompt);
              const auditJson = this.safeJsonParse(auditRes.response.text());
              if (auditJson && !auditJson.approved) {
                  messagesForGPT.push({ role: "assistant", content: currentDraft });
                  messagesForGPT.push({ role: "system", content: `FIX: ${auditJson.critique}` });
              } else approved = true;
          } catch (e) { approved = true; }
      }
      return currentDraft;
  }

  private async simpleGptCall(prompt: string): Promise<string> {
      try {
          const res = await this.openai.chat.completions.create({
              model: AI_CONFIG.openai.model,
              messages: [{ role: "system", content: prompt }]
          });
          return res.choices[0].message.content || "";
      } catch (e: any) { 
          console.error("GPT Error:", e.message);
          return ""; 
      }
  }

  private async gptPackageWithRetry(candidacy: string, bonus: string, contextData: any): Promise<FinalMissionPackage> {
    const templatePackage = this.loadPrompt('prompt_4_frontend_package.md') || "Package JSON.";
    // Sostituiamo anche qui tutti i tag per sicurezza
    let finalPrompt = this.replaceTags(templatePackage, contextData);
    
    finalPrompt = finalPrompt
        .replace('[APPROVED_CANDIDACY]', candidacy)
        .replace('[APPROVED_BONUS]', bonus);
    
    try {
       const res = await this.openai.chat.completions.create({ 
           model: AI_CONFIG.openai.model, 
           messages: [{ role: "system", content: finalPrompt }],
           response_format: { type: "json_object" }
       });
       return JSON.parse(res.choices[0].message.content || "{}");
    } catch(e) {
        return { 
            deliverable_content: candidacy || "Errore Candidatura", 
            bonus_material_title: "Strategic Asset", 
            bonus_material_content: bonus || "Errore Bonus", 
            strategy_brief: "Strategia pronta per l'invio.", 
            execution_steps: ["1. Copia candidatura", "2. Allega bonus", "3. Invia"], 
            estimated_impact: "Alto", 
            is_immediate_task: true, 
            bonus_file_name: "Asset.pdf" 
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