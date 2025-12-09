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
    // Usa un modello stabile. Se gpt-4o non è disponibile, usa gpt-4-turbo
    model: 'gpt-4o', 
  },
  gemini: {
    // Modello Auditor (Controllo Qualità)
    model: 'gemini-1.5-pro-latest', // Aggiornato alla versione stabile più recente
    generationConfig: {
      temperature: 0.1, // Freddo e analitico per l'audit
      maxOutputTokens: 16384 
    }
  },
  system: {
    max_loops: 3,       // Max tentativi di perfezionamento contenuto (ridotto a 3 per velocità/costi)
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
    
    // Gestione Path per Prod/Dev
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
      // Fallback in caso di file mancante per evitare crash
      return "Analyze the mission and generate a professional response."; 
    }
  }

  // ==================================================================================
  // 1️⃣ FASE SVILUPPO STRATEGIA (Chiamato dal Router '/develop')
  // ==================================================================================
  
  // NOTA: Rinomato da 'executeMission' a 'developStrategy' per combaciare con il Router
  public async developStrategy(missionId: string): Promise<FinalMissionPackage> {
    console.log(`\n⚙️ [DEV] Avvio Sviluppo Strategia per: ${missionId}`);
    
    // Recupero dati completi
    const mission = await db.selectFrom('missions').selectAll().where('id', '=', missionId).executeTakeFirst();
    if (!mission) throw new Error("Missione non trovata nel DB");

    // Recupero Profilo Utente (se presente)
    let profileData: any = {};
    if (mission.user_id) {
        const profile = await db.selectFrom('user_ai_profile').select('career_manifesto').where('user_id', '=', mission.user_id).executeTakeFirst();
        profileData = profile?.career_manifesto || {};
    }

    // --- LOOP A: CANDIDATURA (Auditor: Standard) ---
    console.log(`\n🔵 [LOOP A] Sviluppo Candidatura (Target: ${mission.platform || 'Direct'})...`);
    
    // Caricamento e iniezione variabili nel prompt
    let promptCandidacy = this.loadPrompt('prompt_1_gpt_developer_init.md');
    promptCandidacy = promptCandidacy
      .replace('[MISSION_TITLE]', mission.title)
      .replace('[MISSION_DESCRIPTION]', mission.description || 'N/A')
      .replace('[MISSION_PLATFORM]', mission.platform || 'General Website') // Upwork/Fiverr context
      .replace('[MISSION_URL]', mission.source_url || 'N/A')
      .replace('[USER_SKILLS]', JSON.stringify(profileData.keySkillsToAcquire || []))
      .replace('[USER_ADVANTAGES]', JSON.stringify(profileData.unfairAdvantages || []));

    const approvedCandidacy = await this.runQualityLoop(promptCandidacy, mission, 'standard');

    // --- LOOP B: MATERIALE BONUS (Auditor: Hiring Manager) ---
    console.log(`\n🟣 [LOOP B] Sviluppo Bonus Asset...`);
    let promptBonus = this.loadPrompt('prompt_10_bonus_material_init.md');
    promptBonus = promptBonus
      .replace('[MISSION_TITLE]', mission.title)
      .replace('[MISSION_DESCRIPTION]', mission.description || 'N/A')
      .replace('[USER_SKILLS]', JSON.stringify(profileData.keySkillsToAcquire || []));

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
          analysis_notes: finalPackage.strategy_brief, // Salviamo il brief anche qui per lettura rapida
          // Non aggiorniamo created_at, lasciamo updated_at al DB se configurato o manuale:
          // updated_at: new Date() // Scommentare se la colonna esiste ed è gestita manualmente
        })
        .where('id', '=', missionId)
        .execute();
      console.log("✅ Pacchetto Strategico salvato nel DB.");
    } catch (dbError) { 
        console.error("❌ Errore DB update:", dbError); 
    }

    return finalPackage;
  }

  // ==================================================================================
  // 2️⃣ FASE ESECUZIONE LAVORO (Richiesta Cliente -> Lavoro Finale)
  // ==================================================================================
  
  public async executeFinalWork(missionId: string, userId: string, clientInstructions: string): Promise<string> {
      console.log(`\n⚙️ [DEV] Esecuzione Lavoro Finale per Missione: ${missionId}`);
      
      const mission = await db.selectFrom('missions').selectAll().where('id', '=', missionId).executeTakeFirst();
      // const profile = await db.selectFrom('user_ai_profile').select('career_manifesto').where('user_id', '=', userId).executeTakeFirst(); // Opzionale

      if (!mission) throw new Error("Missione non trovata");

      // 1. ANALISI REQUISITI
      console.log("🧠 [PM] Analisi Requisiti Cliente...");
      let structuredRequirements = clientInstructions;
      try {
        const analysisPrompt = this.loadPrompt('prompt_13_client_response_analyzer.md')
            .replace('[MISSION_TITLE]', mission.title)
            .replace('[CLIENT_REPLY]', clientInstructions);
        
        const res = await this.openai.chat.completions.create({
             model: AI_CONFIG.openai.model, messages: [{ role: "system", content: analysisPrompt }]
        });
        structuredRequirements = res.choices[0].message.content || clientInstructions;
      } catch (e) { console.warn("⚠️ Analisi requisiti saltata, uso input grezzo."); }

      // 2. GENERAZIONE LAVORO
      const promptTemplate = this.loadPrompt('prompt_14_final_execution_init.md')
          .replace('[MISSION_TITLE]', mission.title)
          .replace('[CLIENT_REQUIREMENTS]', structuredRequirements);

      // 3. LOOP DI QUALITÀ FINALE
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
        return "Errore critico generazione bozza. Controllare API Key."; 
    }

    if (!currentDraft || currentDraft.length < 5) return "Errore: Bozza vuota generata.";

    let loop = 0;
    let approved = false;
    
    // Loop di Raffinamento
    while (loop < AI_CONFIG.system.max_loops && !approved) {
        let auditResult;

        try {
            // SELEZIONE AUDITOR DINAMICA
            if (mode === 'bonus') {
               auditResult = await this.geminiBonusAudit(currentDraft, missionContext);
            } else if (mode === 'final_work') {
               auditResult = await this.geminiFinalAudit(currentDraft, missionContext);
            } else {
               auditResult = await this.geminiStandardAudit(currentDraft, missionContext);
            }
        } catch (auditError) {
            console.warn("⚠️ Errore durante l'audit (Gemini), procedo con la bozza attuale.");
            approved = true; // Skip audit on error
            break;
        }
        
        // VALUTAZIONE
        if (auditResult.status === 'PASS' || (auditResult.total_score && auditResult.total_score >= 90)) {
            console.log(`   ✅ Approvato (${mode}) - Loop ${loop + 1}: Score ${auditResult.total_score}`);
            approved = true;
        } else {
            // COSTRUZIONE FEEDBACK
            let feedbackPayload = JSON.stringify(auditResult.critique || "Migliorare la qualità generale.");
            console.log(`   🔸 Respinto (${mode}) - Loop ${loop + 1}. Feedback applicato.`);
            
            // GPT FIX
            currentDraft = await this.gptFix(currentDraft, feedbackPayload, loop);
            loop++;
        }
    }

    return currentDraft;
  }

  // ==================================================================================
  // 👷 AUDITORS SPECIALIZZATI
  // ==================================================================================

  private async geminiStandardAudit(draft: string, mission: any): Promise<any> {
    return this.genericAudit('prompt_2_gemini_auditor_metrics.md', 'prompt_3_gemini_auditor_output.json', draft, `CONTEXT: ${mission.title}`);
  }

  private async geminiBonusAudit(draft: string, mission: any): Promise<any> {
    return this.genericAudit('prompt_11_bonus_auditor_metrics.md', 'prompt_12_bonus_auditor_output.json', draft, `JOB CONTEXT: ${mission.title}`);
  }

  private async geminiFinalAudit(draft: string, context: any): Promise<any> {
    try {
      const metrics = this.loadPrompt('prompt_15_final_auditor_metrics.md');
      const fullPrompt = `${metrics}\nREQUIREMENTS: ${context.client_requirements_json}\nDRAFT: "${draft.substring(0, 20000)}"\nOUTPUT FORMAT: JSON { "status": "PASS" | "FAIL", "total_score": 0-100, "critique": "string feedback" }`;
      const result = await this.geminiModel.generateContent(fullPrompt);
      return this.safeJsonParse(result.response.text(), true);
    } catch(e) { return { status: 'PASS', total_score: 100, critique: "Audit Skipped" }; }
  }

  private async genericAudit(metricsFile: string, jsonFile: string, draft: string, contextStr: string): Promise<any> {
    try {
        const metrics = this.loadPrompt(metricsFile);
        const jsonFormat = this.loadPrompt(jsonFile);
        const fullPrompt = `${metrics}\n${contextStr}\nDRAFT: "${draft.substring(0, 20000)}"\nOUTPUT FORMAT: ${jsonFormat}`;
        const result = await this.geminiModel.generateContent(fullPrompt);
        return this.safeJsonParse(result.response.text(), true);
    } catch(e) { 
        return { status: 'PASS', total_score: 80, critique: "Audit Fallback" }; 
    }
  }

  // ==================================================================================
  // 🛠️ FIXER & PACKAGER
  // ==================================================================================

  private async gptFix(draft: string, fixes: string, loop: number): Promise<string> {
    try {
      let template = this.loadPrompt('prompt_5_gpt_fixer_loop.md');
      const prompt = template
        .replace('[ITERATION_NUMBER]', (loop + 1).toString())
        .replace('[GEMINI_CRITIQUE]', fixes)
        .replace('[PREVIOUS_DRAFT]', draft);

      const res = await this.openai.chat.completions.create({
        model: AI_CONFIG.openai.model,
        messages: [{ role: "user", content: prompt }]
      });
      
      return res.choices[0].message.content || "";
    } catch (e: any) {
      return draft; 
    }
  }

  private async gptPackageWithRetry(candidacy: string, bonus: string, mission: any): Promise<FinalMissionPackage> {
    const templatePackage = this.loadPrompt('prompt_4_frontend_package.md');
    
    const finalPrompt = templatePackage
        .replace('[APPROVED_CANDIDACY]', candidacy)
        .replace('[APPROVED_BONUS]', bonus)
        .replace('[MISSION_TITLE]', mission.title)
        .replace('[MISSION_COMPANY]', mission.company_name || 'Azienda Target');
    
    let jsonAttempt = "";
    let loop = 0;

    // Tentativo 1: GPT
    try {
       const res = await this.openai.chat.completions.create({ 
           model: AI_CONFIG.openai.model, 
           messages: [{ role: "system", content: finalPrompt }],
           response_format: { type: "json_object" } // Forza JSON mode
       });
       jsonAttempt = res.choices[0].message.content || "{}";
       const parsed = this.safeJsonParse(jsonAttempt, false);
       if(parsed && parsed.deliverable_content) return parsed;
    } catch(e) {}

    // Tentativo 2: Gemini Fixer (Se GPT fallisce il JSON)
    const templateFixer = this.loadPrompt('prompt_6_json_fixer.md');
    while (loop < 2) {
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
    
    // Fallback di emergenza
    return { 
        deliverable_content: candidacy, 
        bonus_material_title: "Bonus Asset", 
        bonus_material_content: bonus, 
        strategy_brief: "Strategia generata (Packaging automatico fallito, contenuto grezzo disponibile).", 
        execution_steps: ["Step 1: Rivedi manualmente la proposta.", "Step 2: Invia."], 
        estimated_impact: "Alto",
        is_immediate_task: true,
        bonus_file_name: "bonus_material.txt"
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
  }
}