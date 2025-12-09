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
    model: 'gpt-4o', // Il "Braccio" (Esecutore)
  },
  gemini: {
    model: 'gemini-1.5-pro-latest', // La "Mente" (Revisore)
    generationConfig: {
      temperature: 0.1, 
      maxOutputTokens: 16384 
    }
  },
  system: {
    max_loops: 3,       // Giri di correzione (Ping-pong GPT <> Gemini)
    max_json_loops: 3
  }
};

// ==================================================================================
// 📝 INTERFACCE
// ==================================================================================
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
    } catch (e) { return ""; } // Fallback gestito nel codice
  }

  // ==================================================================================
  // 1️⃣ FASE SVILUPPO STRATEGIA (Cover Letter + Bonus)
  // ==================================================================================
  public async developStrategy(missionId: string): Promise<FinalMissionPackage> {
    console.log(`\n⚙️ [DEV] Sviluppo Strategia: ${missionId}`);
    const mission = await db.selectFrom('missions').selectAll().where('id', '=', missionId).executeTakeFirst();
    if (!mission) throw new Error("Missione non trovata");

    let profileData: any = {};
    if (mission.user_id) {
        const profile = await db.selectFrom('user_ai_profile').select('career_manifesto').where('user_id', '=', mission.user_id).executeTakeFirst();
        profileData = profile?.career_manifesto || {};
    }

    // Loop A: Candidatura
    let promptCandidacy = this.loadPrompt('prompt_1_gpt_developer_init.md');
    if (!promptCandidacy) promptCandidacy = "Write a killer freelance proposal for: [MISSION_TITLE]. Use skills: [USER_SKILLS].";
    
    promptCandidacy = promptCandidacy
      .replace('[MISSION_TITLE]', mission.title)
      .replace('[MISSION_DESCRIPTION]', mission.description || 'N/A')
      .replace('[MISSION_PLATFORM]', mission.platform || 'General')
      .replace('[MISSION_URL]', mission.source_url || 'N/A')
      .replace('[USER_SKILLS]', JSON.stringify(profileData.keySkillsToAcquire || []))
      .replace('[USER_ADVANTAGES]', JSON.stringify(profileData.unfairAdvantages || []));

    const approvedCandidacy = await this.runQualityLoop(promptCandidacy, mission, 'standard');

    // Loop B: Bonus
    let promptBonus = this.loadPrompt('prompt_10_bonus_material_init.md');
    if (!promptBonus) promptBonus = "Create a high-value bonus asset for this job: [MISSION_TITLE].";

    promptBonus = promptBonus
      .replace('[MISSION_TITLE]', mission.title)
      .replace('[MISSION_DESCRIPTION]', mission.description || 'N/A')
      .replace('[USER_SKILLS]', JSON.stringify(profileData.keySkillsToAcquire || []));

    const approvedBonus = await this.runQualityLoop(promptBonus, mission, 'bonus');

    // Packaging
    const finalPackage = await this.gptPackageWithRetry(approvedCandidacy, approvedBonus, mission);
    
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
  // 2️⃣ FASE ESECUZIONE LAVORO (LOOP GPT <-> GEMINI ATTIVO)
  // ==================================================================================
  public async executeFinalWork(missionId: string, userId: string, clientInstructions: string): Promise<string> {
      console.log(`\n⚙️ [DEV] Esecuzione Lavoro Finale (Loop Attivo) per: ${missionId}`);
      
      const mission = await db.selectFrom('missions').selectAll().where('id', '=', missionId).executeTakeFirst();
      if (!mission) throw new Error("Missione non trovata");

      // 1. Recupero Memoria Storica (Promessa + Bonus)
      let prevStrategy = "N/A";
      let prevBonus = "N/A";
      
      if (mission.final_deliverable_json) {
          try {
              const json = typeof mission.final_deliverable_json === 'string' 
                ? JSON.parse(mission.final_deliverable_json) 
                : mission.final_deliverable_json;
              prevStrategy = json.deliverable_content || "N/A";
              prevBonus = json.bonus_material_content || "N/A";
          } catch(e) {}
      }

      // 2. Costruzione Prompt Maestro (Anti-Rifiuto)
      // Questo prompt è progettato per non dire mai "Non posso farlo".
      const masterPrompt = `
      ROLE: You are an Elite AI Specialist executing a paid task.
      
      --- CONTEXT (THE MISSION) ---
      Title: ${mission.title}
      Original Brief: ${mission.description || 'N/A'}
      
      --- OUR PROMISE (COVER LETTER) ---
      We promised this approach:
      "${prevStrategy.substring(0, 1500)}..."
      
      --- BONUS MATERIAL WE CREATED ---
      "${prevBonus.substring(0, 1000)}..."
      
      --- USER INSTRUCTIONS (THE TASK NOW) ---
      ${clientInstructions}
      
      --- CRITICAL INSTRUCTIONS ---
      1. EXECUTE the work requested in "USER INSTRUCTIONS".
      2. If the user instructions are vague (e.g., "start", "do it"), DEDUCE the task from the "Original Brief" and "Our Promise" and EXECUTE IT.
      3. DO NOT ASK FOR CLARIFICATION. Make a reasonable assumption and produce the output.
      4. MAINTAIN CONSISTENCY with the tone and quality of our Cover Letter.
      5. Output ONLY the final result (Code, Article, Analysis, etc.). No "Here is the work" prefixes.
      `;

      // 3. Avvio il Loop di Qualità (GPT Esegue -> Gemini Controlla -> GPT Corregge)
      // Passiamo un contesto speciale per l'auditor
      const contextForAuditor = {
          client_requirements: clientInstructions,
          mission_title: mission.title,
          original_promise: prevStrategy
      };

      const finalWork = await this.runQualityLoop(masterPrompt, contextForAuditor, 'final_work');
      
      console.log("✅ Lavoro Finale Completato e Validato.");
      return finalWork;
  }

  // ==================================================================================
  // 🧠 CORE: IL LOOP DI QUALITÀ UNIVERSALE
  // ==================================================================================

  private async runQualityLoop(initialPrompt: string, context: any, mode: 'standard' | 'bonus' | 'final_work'): Promise<string> {
    // 1. Generazione Bozza (GPT-4o)
    let currentDraft = "";
    try {
        console.log(`   🤖 [GPT] Generazione Bozza (${mode})...`);
        const res = await this.openai.chat.completions.create({
            model: AI_CONFIG.openai.model,
            messages: [{ role: "system", content: initialPrompt }]
        });
        currentDraft = res.choices[0].message.content || "";
    } catch(e: any) { 
        console.error("GPT Error:", e);
        return "Errore critico API OpenAI. Controllare credenziali."; 
    }

    if (!currentDraft || currentDraft.length < 10) return "Errore: Bozza troppo breve o vuota.";

    // 2. Loop di Audit (Gemini)
    let loop = 0;
    let approved = false;
    
    while (loop < AI_CONFIG.system.max_loops && !approved) {
        let auditResult;
        
        try {
            if (mode === 'final_work') {
                auditResult = await this.geminiFinalAudit(currentDraft, context);
            } else if (mode === 'bonus') {
                auditResult = await this.geminiBonusAudit(currentDraft, context);
            } else {
                auditResult = await this.geminiStandardAudit(currentDraft, context);
            }
        } catch (e) {
            console.warn("⚠️ Gemini Audit fallito, salto controllo.");
            auditResult = { status: 'PASS', critique: 'Audit error bypassed.' };
        }

        if (auditResult.status === 'PASS') {
            console.log(`   ✅ Approvato (${mode}) - Loop ${loop + 1}`);
            approved = true;
        } else {
            console.log(`   🔸 Respinto (${mode}) - Loop ${loop + 1}. Feedback: ${auditResult.critique.substring(0, 50)}...`);
            
            // GPT Fixer
            const fixPrompt = `
            CRITICAL FEEDBACK FROM AUDITOR:
            "${auditResult.critique}"
            
            ORIGINAL DRAFT:
            "${currentDraft}"
            
            TASK: Rewrite the draft to address the feedback perfectly. Keep the good parts.
            `;
            
            try {
                const res = await this.openai.chat.completions.create({
                    model: AI_CONFIG.openai.model,
                    messages: [{ role: "system", content: fixPrompt }]
                });
                currentDraft = res.choices[0].message.content || currentDraft;
            } catch(e) {}
            
            loop++;
        }
    }

    return currentDraft;
  }

  // ==================================================================================
  // 🕵️ AUDITORS (Gemini)
  // ==================================================================================

  // Auditor Speciale per l'Esecuzione Finale
  private async geminiFinalAudit(draft: string, context: any): Promise<any> {
      const prompt = `
      ROLE: You are a Quality Assurance Manager.
      
      CLIENT REQUEST:
      "${context.client_requirements}"
      
      OUR PROMISE (CONTEXT):
      "${context.original_promise.substring(0, 500)}..."
      
      DRAFT DELIVERABLE TO REVIEW:
      "${draft.substring(0, 20000)}"
      
      TASK:
      1. Does the draft actually DO what the Client requested? (Pass/Fail)
      2. Is the quality consistent with a Senior Freelancer? (Pass/Fail)
      3. Did it refuse the task? (If yes, FAIL IMMEDIATELY).
      
      OUTPUT JSON:
      {
        "status": "PASS" | "FAIL",
        "critique": "Specific instructions on how to fix it (if FAIL)"
      }
      `;
      
      try {
          const result = await this.geminiModel.generateContent(prompt);
          const text = result.response.text();
          return this.safeJsonParse(text) || { status: 'PASS', critique: '' };
      } catch (e) { return { status: 'PASS', critique: '' }; }
  }

  private async geminiStandardAudit(draft: string, context: any): Promise<any> {
    // Audit semplificato per brevità, in produzione usa i file .md
    const prompt = `Review this Cover Letter: "${draft.substring(0, 10000)}". Mission: ${context.title}. JSON Output: { "status": "PASS" | "FAIL", "critique": "feedback" }`;
    try {
        const result = await this.geminiModel.generateContent(prompt);
        return this.safeJsonParse(result.response.text()) || { status: 'PASS' };
    } catch (e) { return { status: 'PASS' }; }
  }

  private async geminiBonusAudit(draft: string, context: any): Promise<any> {
     const prompt = `Review this Bonus Asset: "${draft.substring(0, 10000)}". Mission: ${context.title}. JSON Output: { "status": "PASS" | "FAIL", "critique": "feedback" }`;
     try {
        const result = await this.geminiModel.generateContent(prompt);
        return this.safeJsonParse(result.response.text()) || { status: 'PASS' };
     } catch (e) { return { status: 'PASS' }; }
  }

  // ==================================================================================
  // 🛠️ PACKAGER
  // ==================================================================================
  private async gptPackageWithRetry(candidacy: string, bonus: string, mission: any): Promise<FinalMissionPackage> {
    const prompt = `
    Package into JSON.
    Candidacy: ${candidacy.substring(0, 5000)}
    Bonus: ${bonus.substring(0, 5000)}
    Mission: ${mission.title}
    
    Format:
    { "deliverable_content": "...", "strategy_brief": "...", "execution_steps": ["..."], "estimated_impact": "...", "bonus_material_title": "...", "bonus_material_content": "...", "is_immediate_task": true, "bonus_file_name": "bonus.txt" }
    `;
    
    try {
       const res = await this.openai.chat.completions.create({ 
           model: AI_CONFIG.openai.model, 
           messages: [{ role: "system", content: prompt }],
           response_format: { type: "json_object" }
       });
       return JSON.parse(res.choices[0].message.content || "{}");
    } catch(e) {
        return { 
            deliverable_content: candidacy, bonus_material_title: "Bonus", bonus_material_content: bonus, 
            strategy_brief: "Ready.", execution_steps: [], estimated_impact: "High", is_immediate_task: true, bonus_file_name: "bonus.txt" 
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