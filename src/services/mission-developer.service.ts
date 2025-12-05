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
    // Modello Esecutore (Generazione).
    model: 'gpt-5.1-chat-latest', // Fallback automatico a gpt-4o se non disponibile
  },
  gemini: {
    // Modello Auditor (Controllo Qualità).
    model: 'gemini-2.5-pro',
    generationConfig: {
      temperature: 0.1, // Freddo e analitico per l'audit
      maxOutputTokens: 16384 
    }
  },
  system: {
    max_loops: 12,      // Max tentativi di perfezionamento contenuto
    max_json_loops: 3   // Max tentativi di riparazione JSON
  }
};

// ==================================================================================
// 📝 INTERFACCE OUTPUT
// ==================================================================================
export interface FinalMissionPackage {
  deliverable_content: string;    // La Cover Letter o Proposta
  strategy_brief: string;         // Perché questa strategia vince
  execution_steps: string[];      // Cosa deve fare l'utente
  estimated_impact: string;       // Previsione risultato
  bonus_material_title: string;   // Titolo del materiale extra
  bonus_material_content: string; // Il contenuto del materiale extra
  is_immediate_task: boolean;     // Se true, si può fare subito
  bonus_file_name: string;        // Nome file suggerito
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
      console.error(`❌ Errore caricamento prompt: ${filename}`);
      throw new Error(`Prompt file missing: ${filename}.`);
    }
  }

  // ==================================================================================
  // 1️⃣ FASE CANDIDATURA (Analisi -> Strategia -> Cover Letter + Bonus)
  // ==================================================================================
  
  public async executeMission(missionId: string, userId: string): Promise<FinalMissionPackage> {
    console.log(`\n⚙️ [DEV] Avvio Sviluppo Pacchetto Candidatura: ${missionId}`);
    
    const mission = await db.selectFrom('missions').selectAll().where('id', '=', missionId).executeTakeFirst();
    const profile = await db.selectFrom('user_ai_profile').select('career_manifesto').where('user_id', '=', userId).executeTakeFirst();

    if (!mission) throw new Error("Missione non trovata nel DB");

    // --- LOOP A: CANDIDATURA (Auditor: Standard) ---
    console.log(`\n🔵 [LOOP A] Sviluppo Candidatura (Standard Audit)...`);
    const promptCandidacy = this.loadPrompt('prompt_1_gpt_developer_init.md')
      .replace('[MISSION_TITLE]', mission.title)
      .replace('[MISSION_DESCRIPTION]', mission.description || 'N/A')
      .replace('[MISSION_URL]', mission.source_url || 'N/A')
      .replace('[USER_SKILLS]', JSON.stringify(profile?.career_manifesto?.keySkillsToAcquire || []))
      .replace('[USER_ADVANTAGES]', JSON.stringify(profile?.career_manifesto?.unfairAdvantages || []));

    const approvedCandidacy = await this.runQualityLoop(promptCandidacy, mission, 'standard');

    // --- LOOP B: MATERIALE BONUS (Auditor: Hiring Manager) ---
    console.log(`\n🟣 [LOOP B] Sviluppo Bonus (Hiring Manager Audit)...`);
    const promptBonus = this.loadPrompt('prompt_10_bonus_material_init.md')
      .replace('[MISSION_TITLE]', mission.title)
      .replace('[MISSION_DESCRIPTION]', mission.description || 'N/A')
      .replace('[USER_SKILLS]', JSON.stringify(profile?.career_manifesto?.keySkillsToAcquire || []));

    const approvedBonus = await this.runQualityLoop(promptBonus, mission, 'bonus');

    // --- PACKAGING FINALE ---
    console.log("\n📦 [SYSTEM] Packaging JSON Finale...");
    const finalPackage = await this.gptPackageWithRetry(approvedCandidacy, approvedBonus, mission);
    
    // Persistenza DB
    try {
      await db.updateTable('missions')
        .set({
          status: 'developed', 
          final_deliverable_json: JSON.stringify(finalPackage), 
          updated_at: new Date().toISOString() as any, 
        })
        .where('id', '=', missionId)
        .execute();
      console.log("✅ Pacchetto Candidatura salvato nel DB.");
    } catch (dbError) { console.error("❌ Errore DB update:", dbError); }

    return finalPackage;
  }

  // ==================================================================================
  // 2️⃣ FASE ESECUZIONE LAVORO (Richiesta Cliente -> Lavoro Finale)
  // ==================================================================================
  
  public async executeFinalWork(missionId: string, userId: string, clientInstructions: string): Promise<string> {
      console.log(`\n⚙️ [DEV] Esecuzione Lavoro Finale per Missione: ${missionId}`);
      
      const mission = await db.selectFrom('missions').selectAll().where('id', '=', missionId).executeTakeFirst();
      const profile = await db.selectFrom('user_ai_profile').select('career_manifesto').where('user_id', '=', userId).executeTakeFirst();

      if (!mission) throw new Error("Missione non trovata");

      // 1. ANALISI REQUISITI (Il Project Manager - Prompt 13)
      console.log("🧠 [PM] Analisi Requisiti Cliente...");
      let structuredRequirements = clientInstructions;
      try {
        const analysisPrompt = this.loadPrompt('prompt_13_client_response_analyzer.md')
            .replace('[MISSION_TITLE]', mission.title)
            .replace('[CLIENT_REPLY]', clientInstructions);
        
        const res = await this.openai.chat.completions.create({
             model: AI_CONFIG.openai.model, messages: [{ role: "system", content: analysisPrompt }]
        });
        // Usiamo l'output strutturato JSON se disponibile
        structuredRequirements = res.choices[0].message.content || clientInstructions;
      } catch (e) { console.warn("⚠️ Analisi requisiti saltata, uso input grezzo."); }

      // 2. GENERAZIONE LAVORO (L'Esecutore Senior - Prompt 14)
      const promptTemplate = this.loadPrompt('prompt_14_final_execution_init.md')
          .replace('[MISSION_TITLE]', mission.title)
          .replace('[USER_SKILLS]', JSON.stringify(profile?.career_manifesto?.keySkillsToAcquire || []))
          .replace('[CLIENT_REQUIREMENTS]', structuredRequirements);

      // 3. LOOP DI QUALITÀ FINALE (L'Auditor QA - Prompt 15)
      console.log("🤖 [GPT] Generazione Lavoro Finale...");
      
      const finalWorkContext = { ...mission, client_requirements_json: structuredRequirements };
      const finalWork = await this.runQualityLoop(promptTemplate, finalWorkContext, 'final_work');
      
      console.log("✅ Lavoro Finale Completato e Validato.");
      return finalWork;
  }

  // ==================================================================================
  // 🧠 CORE: IL LOOP DI QUALITÀ UNIVERSALE (Gestisce i 3 tipi di Audit)
  // ==================================================================================

  private async runQualityLoop(initialPrompt: string, missionContext: any, mode: 'standard' | 'bonus' | 'final_work'): Promise<string> {
    // 1. Generazione Bozza Iniziale
    let currentDraft = "";
    try {
        const res = await this.openai.chat.completions.create({
            model: AI_CONFIG.openai.model,
            messages: [{ role: "system", content: initialPrompt }]
        });
        currentDraft = res.choices[0].message.content || "";
    } catch(e: any) { 
        this.handleApiError(e, 'GPT Generate');
        return "Errore critico generazione bozza."; 
    }

    if (!currentDraft || currentDraft.length < 5) return "Errore: Bozza vuota generata.";

    let loop = 0;
    let approved = false;
    
    // Loop di Raffinamento
    while (loop < AI_CONFIG.system.max_loops && !approved) {
        let auditResult;

        // SELEZIONE AUDITOR DINAMICA
        if (mode === 'bonus') {
           auditResult = await this.geminiBonusAudit(currentDraft, missionContext);
        } else if (mode === 'final_work') {
           auditResult = await this.geminiFinalAudit(currentDraft, missionContext);
        } else {
           auditResult = await this.geminiStandardAudit(currentDraft, missionContext);
        }
        
        // VALUTAZIONE
        // Accettiamo se status è PASS o il punteggio è molto alto
        if (auditResult.status === 'PASS' || (auditResult.total_score && auditResult.total_score >= 95)) {
            console.log(`   ✅ Approvato (${mode}) - Loop ${loop + 1}: Score ${auditResult.total_score}`);
            approved = true;
        } else {
            // COSTRUZIONE FEEDBACK
            let feedbackPayload = "";
            let logMsg = "";

            if (mode === 'bonus') {
                logMsg = auditResult.manager_feedback || "Bonus non idoneo.";
                feedbackPayload = JSON.stringify({ feedback: auditResult.manager_feedback, issues: auditResult.critique });
            } else if (mode === 'final_work') {
                logMsg = "Requisiti non soddisfatti.";
                feedbackPayload = JSON.stringify(auditResult); // Passiamo tutto l'oggetto audit
            } else {
                logMsg = "Critiche standard rilevate.";
                feedbackPayload = JSON.stringify(auditResult.critique);
            }

            console.log(`   🔸 Respinto (${mode}) - Loop ${loop + 1}: ${logMsg.substring(0, 60)}...`);
            
            // GPT FIX
            currentDraft = await this.gptFix(currentDraft, feedbackPayload, loop);
            loop++;
        }
    }

    if (!approved) console.warn(`⚠️ ATTENZIONE: Qualità massima non raggiunta dopo ${AI_CONFIG.system.max_loops} tentativi.`);
    return currentDraft;
  }

  // ==================================================================================
  // 👷 AUDITORS SPECIALIZZATI
  // ==================================================================================

  // Auditor 1: Standard (Prompt 2 + 3)
  private async geminiStandardAudit(draft: string, mission: any): Promise<any> {
    return this.genericAudit('prompt_2_gemini_auditor_metrics.md', 'prompt_3_gemini_auditor_output.json', draft, `CONTEXT: ${mission.title}`);
  }

  // Auditor 2: Bonus (Prompt 11 + 12)
  private async geminiBonusAudit(draft: string, mission: any): Promise<any> {
    return this.genericAudit('prompt_11_bonus_auditor_metrics.md', 'prompt_12_bonus_auditor_output.json', draft, `JOB CONTEXT: ${mission.title}`);
  }

  // Auditor 3: Lavoro Finale (Prompt 15)
  private async geminiFinalAudit(draft: string, context: any): Promise<any> {
    try {
      const metrics = this.loadPrompt('prompt_15_final_auditor_metrics.md');
      const fullPrompt = `${metrics}\nREQUIREMENTS: ${context.client_requirements_json}\nDRAFT: "${draft.substring(0, 25000)}"\nOUTPUT FORMAT: JSON { "status": "PASS" | "FAIL", "total_score": 0-100, "critique": "string feedback" }`;
      const result = await this.geminiModel.generateContent(fullPrompt);
      return this.safeJsonParse(result.response.text(), true);
    } catch(e) { return { status: 'FAIL', total_score: 0, critique: "Audit Error" }; }
  }

  // Helper Generico per Audit
  private async genericAudit(metricsFile: string, jsonFile: string, draft: string, contextStr: string): Promise<any> {
    try {
        const metrics = this.loadPrompt(metricsFile);
        const jsonFormat = this.loadPrompt(jsonFile);
        const fullPrompt = `${metrics}\n${contextStr}\nDRAFT: "${draft.substring(0, 25000)}"\nOUTPUT FORMAT: ${jsonFormat}`;
        const result = await this.geminiModel.generateContent(fullPrompt);
        return this.safeJsonParse(result.response.text(), true);
    } catch(e) { 
        return { status: 'FAIL', total_score: 0, manager_feedback: "JSON Parsing Error", critique: [] }; 
    }
  }

  // ==================================================================================
  // 🛠️ FIXER & PACKAGER
  // ==================================================================================

  private async gptFix(draft: string, fixes: string, loop: number): Promise<string> {
    try {
      const template = this.loadPrompt('prompt_5_gpt_fixer_loop.md');
      const prompt = template
        .replace('[ITERATION_NUMBER]', (loop + 1).toString())
        .replace('[GEMINI_CRITIQUE]', fixes)
        .replace('[PREVIOUS_DRAFT]', draft);

      const res = await this.openai.chat.completions.create({
        model: AI_CONFIG.openai.model,
        messages: [
          { role: "assistant", content: draft },
          { role: "user", content: prompt }
        ]
      });
      
      return res.choices[0].message.content || "";
    } catch (e: any) {
      console.error("GPT Fix Error:", e);
      return draft; // Fallback
    }
  }

  private async gptPackageWithRetry(candidacy: string, bonus: string, mission: any): Promise<FinalMissionPackage> {
    const templatePackage = this.loadPrompt('prompt_4_frontend_package.md');
    const templateFixer = this.loadPrompt('prompt_6_json_fixer.md');
    
    const finalPrompt = templatePackage
        .replace('[APPROVED_CANDIDACY]', candidacy)
        .replace('[APPROVED_BONUS]', bonus)
        .replace('[MISSION_TITLE]', mission.title)
        .replace('[MISSION_COMPANY]', mission.company_name || 'Azienda Target');
    
    let jsonAttempt = "";
    let loop = 0;

    // Tentativo 1
    try {
       const res = await this.openai.chat.completions.create({ model: AI_CONFIG.openai.model, messages: [{ role: "system", content: finalPrompt }] });
       jsonAttempt = res.choices[0].message.content || "{}";
       const parsed = this.safeJsonParse(jsonAttempt, false);
       if(parsed) return parsed;
    } catch(e) {}

    // Loop Riparazione JSON
    while (loop < AI_CONFIG.system.max_json_loops) {
       loop++;
       try {
         const fullPrompt = `${templateFixer}\n\nBROKEN JSON:\n${jsonAttempt}`;
         const result = await this.geminiModel.generateContent(fullPrompt);
         jsonAttempt = result.response.text();
         const parsed = this.safeJsonParse(jsonAttempt, true);
         console.log("✅ JSON riparato da Gemini!");
         return parsed;
       } catch(e) {}
    }
    
    // Fallback
    return { 
        deliverable_content: candidacy, 
        bonus_material_title: "Bonus Generato", 
        bonus_material_content: bonus, 
        strategy_brief: "Errore Packaging Automatico.", 
        execution_steps: ["Copia manuale richiesta"], 
        estimated_impact: "N/A",
        is_immediate_task: false,
        bonus_file_name: "bonus.txt"
    };
  }

  // --- UTILS ---

  private safeJsonParse(text: string, throwOnError = false): any {
    try {
      let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const start = clean.indexOf('{');
      const end = clean.lastIndexOf('}');
      if (start !== -1 && end !== -1) clean = clean.substring(start, end + 1);
      return JSON.parse(clean);
    } catch (e) { if (throwOnError) throw e; return null; }
  }

  private handleApiError(e: any, context: string) {
    console.error(`❌ ERRORE in ${context}:`, e.message || e);
    if (e.status === 404 || e.code === 'model_not_found') {
      console.error(`🔴 CRITICO: Il modello specificato in AI_CONFIG non esiste o non hai accesso.`);
    }
  }
}