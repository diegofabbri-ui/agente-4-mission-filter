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
    model: 'gpt-5.1-chat-latest', // Modello "Reasoning" (o1-preview/mini). Richiede temperature=1.
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

    // B. Generazione Bonus Asset
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

          finalResponse = await this.simpleGptCall(orchestratorPrompt);
          
          // SALVIAMO IL PIANO NELLA "MEMORIA A LUNGO TERMINE"
          updatedRawData.orchestration_plan = finalResponse;
          console.log("📄 [DEBUG] PIANO SALVATO:\n", finalResponse);
      } 
      
      // --- CASO B: STEP SUCCESSIVI (ESECUZIONE WORKER) ---
      else {
          console.log(`🔨 [AGENTE] Esecuzione Step ${currentStep + 1}...`);
          
          const masterPlan = updatedRawData.orchestration_plan || "⚠️ NESSUN PIANO TROVATO. Procedi con best practice.";
          
          let workerPrompt = this.loadPrompt('prompt_worker.md');
          workerPrompt = workerPrompt
              .replace('{{ORCHESTRATION_PLAN}}', masterPlan)
              .replace('{{USER_INPUT}}', userInput);

          let history: any[] = [];
          if (typeof mission.conversation_history === 'string') {
              history = JSON.parse(mission.conversation_history);
          } else if (Array.isArray(mission.conversation_history)) {
              history = mission.conversation_history;
          }

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
      
      const updatedHistory = [...history, newMessageUser, newMessageAI];

      await db.updateTable('missions')
        .set({
            conversation_history: JSON.stringify(updatedHistory),
            raw_data: JSON.stringify(updatedRawData),
            final_work_content: finalResponse,
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
              conversation_history: JSON.stringify([]), // 🗑️ PULIZIA MEMORIA
          })
          .where('id', '=', missionId)
          .execute();
  }

  // ==================================================================================
  // UTILS: IL LOOP DI ESECUZIONE & AUDIT (GPT <-> GEMINI)
  // ==================================================================================
  private async runExecutionLoop(systemPrompt: string, history: any[], userInput: string): Promise<string> {
      let currentDraft = "";
      let loopCount = 0;
      let approved = false;
      let critiqueLog = [];

      const auditorMetrics = this.loadPrompt('prompt_2_gemini_auditor_metrics.md');
      const auditorSchema = this.loadPrompt('prompt_3_gemini_auditor_output.json');
      const fixerPromptTemplate = this.loadPrompt('prompt_5_gpt_fixer_loop.md');

      const messagesForGPT = [
          { role: "system", content: systemPrompt },
          ...history.map(h => ({ role: h.role, content: h.content })), 
          { role: "user", content: userInput }
      ];

      console.log(`🔄 [LOOP] Avvio ciclo di perfezionamento (Max: ${AI_CONFIG.system.max_loops})...`);

      while (loopCount < AI_CONFIG.system.max_loops && !approved) {
          loopCount++;
          console.log(`   ► Iterazione ${loopCount}/${AI_CONFIG.system.max_loops}`);

          // 1. GPT GENERA
          try {
              const res = await this.openai.chat.completions.create({
                  model: AI_CONFIG.openai.model, 
                  messages: messagesForGPT as any,
                  // ⚠️ FIX CRITICO: Rimosso 'temperature' per compatibilità con modelli o1/gpt-5.1
              });
              currentDraft = res.choices[0].message.content || "";
          } catch (e: any) {
              console.error(`❌ GPT Error:`, e.message);
              return "Errore tecnico generazione. Controllare i log.";
          }

          if (currentDraft.length < 50 || loopCount >= AI_CONFIG.system.max_loops) {
              approved = true;
              break;
          }

          // 2. GEMINI AUDITA
          try {
              const auditPromptFull = `
              ${auditorMetrics}
              ---
              **INPUT CONTEXT:** "${userInput.substring(0, 1000)}..."
              **EXECUTOR DRAFT:** \`\`\`${currentDraft.substring(0, 15000)}\`\`\`
              **OUTPUT SCHEMA:** ${auditorSchema}
              `;

              const auditRes = await this.geminiModel.generateContent(auditPromptFull);
              const auditJson = this.safeJsonParse(auditRes.response.text());

              if (auditJson && auditJson.status === "PASS") {
                  console.log("✅ [GEMINI] Draft Approvato!");
                  approved = true;
              } else if (auditJson) {
                  console.log("❌ [GEMINI] Rifiutato. Critiche:", JSON.stringify(auditJson.critique).substring(0, 100));
                  
                  let fixerPrompt = fixerPromptTemplate
                      .replace('[ITERATION_NUMBER]', loopCount.toString())
                      .replace('[PREVIOUS_DRAFT]', "Vedi bozza precedente")
                      .replace('[GEMINI_CRITIQUE]', JSON.stringify(auditJson.critique));

                  messagesForGPT.push({ role: "assistant", content: currentDraft });
                  messagesForGPT.push({ role: "system", content: fixerPrompt });
                  
                  critiqueLog.push(auditJson.critique);
              } else {
                  approved = true;
              }
          } catch (e) { 
              console.error("⚠️ Errore critico Loop Audit:", e);
              approved = true; 
          }
      }

      return currentDraft;
  }

  private async simpleGptCall(prompt: string): Promise<string> {
      try {
          const res = await this.openai.chat.completions.create({
              model: AI_CONFIG.openai.model,
              messages: [{ role: "system", content: prompt }]
              // ⚠️ FIX: No temperature qui
          });
          return res.choices[0].message.content || "";
      } catch (e: any) { 
          console.error("GPT Error:", e.message);
          return ""; 
      }
  }

  private async gptPackageWithRetry(candidacy: string, bonus: string, contextData: any): Promise<FinalMissionPackage> {
    const templatePackage = this.loadPrompt('prompt_4_frontend_package.md') || "Package JSON.";
    let finalPrompt = this.replaceTags(templatePackage, contextData);
    
    finalPrompt = finalPrompt
        .replace('[APPROVED_CANDIDACY]', candidacy)
        .replace('[APPROVED_BONUS]', bonus);
    
    try {
       const res = await this.openai.chat.completions.create({ 
           model: AI_CONFIG.openai.model, 
           messages: [{ role: "system", content: finalPrompt }],
           response_format: { type: "json_object" }
           // ⚠️ FIX: No temperature qui
       });
       return JSON.parse(res.choices[0].message.content || "{}");
    } catch(e) {
        return { 
            deliverable_content: candidacy || "Errore Candidatura", 
            bonus_material_title: "Strategic Asset", 
            bonus_material_content: bonus || "Errore Bonus", 
            strategy_brief: "Strategia pronta.", 
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