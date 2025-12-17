import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { db } from '../infra/db';
import { RagService } from './rag.service';

// ==================================================================================
// ⚙️ CONFIGURAZIONE MODELLI (HYPER-INTELLIGENCE)
// ==================================================================================
const AI_CONFIG = {
  openai: {
    model: 'gpt-5.1-chat-latest', // Modello Reasoning.
  },
  gemini: {
    model: 'gemini-2.5-pro', // Modello Judge ad alta capacità di contesto
    generationConfig: {
      temperature: 0.0, // Zero creatività, pura logica di classificazione
      maxOutputTokens: 8192
    }
  },
  system: {
    max_loops: 3, // Limite tentativi di autocorrezione
  }
};

export class MissionDeveloperService {
  private openai: OpenAI;
  private geminiClient: GoogleGenerativeAI;
  private geminiModel: any;
  private kbPath: string;
  private ragService: RagService;

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.ragService = new RagService();
    
    const geminiKey = process.env.GEMINI_API_KEY || '';
    if (!geminiKey) console.warn("⚠️ GEMINI_API_KEY mancante! Guardrail disabilitato.");
    
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
  private loadSystemPrompt(filename: string, subfolder: string = ''): string {
    try {
      const pathsToTry = [
        path.join(this.kbPath, subfolder, filename),
        path.join(this.kbPath, 'developer', filename),
        path.join(this.kbPath, 'guardrails', filename),
        path.join(this.kbPath, filename)
      ];

      for (const p of pathsToTry) {
        if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8');
      }
      return "";
    } catch (e) {
      console.warn(`⚠️ Prompt mancante: ${filename}`);
      return "";
    }
  }

  // --- HELPER: SOSTITUZIONE TAG ---
  private replaceTags(template: string, data: Record<string, string>): string {
      let result = template;
      for (const [key, value] of Object.entries(data)) {
          result = result.split(key).join(value || "N/A");
      }
      return result;
  }

  /**
   * ==================================================================================
   * 🎮 MAIN CONTROLLER: GENESI O ESECUZIONE
   * Gestisce il bivio tra inizializzazione (Layout 2) e chat (Layout 3).
   * ==================================================================================
   */
  public async generateExecResponse(missionId: string, userMessage: string): Promise<string> {
    console.log(`\n🤖 [ORCHESTRATOR] Analisi richiesta per Missione: ${missionId}`);

    const mission = await db.selectFrom('missions')
        .selectAll()
        .where('id', '=', missionId)
        .executeTakeFirst();

    if (!mission) throw new Error("Missione non trovata.");

    // SE MANCANO GLI ASSET FONDAMENTALI -> FASE GENESI
    // (Cioè: non abbiamo ancora generato il piano strategico o la candidatura)
    if (!mission.analysis_notes || !mission.final_work_content) {
        return await this.runGenesisSequence(mission, userMessage);
    } else {
        // ALTRIMENTI -> FASE ESECUZIONE CON GUARDRAIL (A3->A / B3->B)
        return await this.runExecutionLoop(mission, userMessage);
    }
  }

  /**
   * ==================================================================================
   * 🌱 FASE 1: GENESI (Creazione Asset & Piano Markdown)
   * Viene eseguita UNA volta alla prima richiesta specifica dell'utente.
   * ==================================================================================
   */
  private async runGenesisSequence(mission: any, specificRequest: string): Promise<string> {
    console.log("🚀 AVVIO SEQUENZA GENESI...");

    // 1. Recupero dati profilo
    let profileData: any = {};
    if (mission.user_id) {
        const p = await db.selectFrom('user_ai_profile').select('career_manifesto').where('user_id', '=', mission.user_id).executeTakeFirst();
        profileData = p?.career_manifesto || {};
    }

    const contextData = {
        '[MISSION_TITLE]': mission.title,
        '[MISSION_DESCRIPTION]': mission.description || "N/A",
        '[USER_REQUEST]': specificRequest,
        '[USER_SKILLS]': JSON.stringify(profileData.keySkillsToAcquire || []),
        '[PLATFORM]': mission.platform || "Web"
    };

    // 2. GENERAZIONE CANDIDATURA (GPT-5.1)
    console.log("... Generazione Candidatura");
    const candFile = mission.type === 'monthly' ? 'prompt_1_monthly_candidacy.md' : 'prompt_1_weekly_candidacy.md';
    let rawPromptCand = this.loadSystemPrompt(candFile, 'developer') || "Generate pitch.";
    const finalPromptCand = this.replaceTags(rawPromptCand, contextData);
    const candidacy = await this.simpleGptCall(finalPromptCand, `CONTEXT: ${JSON.stringify(mission)}\nGOAL: ${specificRequest}`);

    // 3. GENERAZIONE MATERIALE BONUS (GPT-5.1)
    console.log("... Generazione Materiale Bonus");
    let rawPromptBonus = this.loadSystemPrompt('prompt_10_bonus_material_init.md', 'developer');
    const finalPromptBonus = this.replaceTags(rawPromptBonus, contextData);
    const bonusJsonRaw = await this.simpleGptCall(finalPromptBonus, "Create high-value JSON deliverable.");
    
    // 4. GENERAZIONE PIANO STRATEGICO (Markdown)
    // Questo è il "Piano di Lavoro" derivato dal primo comando
    console.log("... Generazione Piano Strategico (Markdown)");
    const orchestratorPrompt = this.loadSystemPrompt('prompt_orchestrator.md', 'developer');
    const strategicPlan = await this.simpleGptCall(
        orchestratorPrompt,
        `ANALYZE MISSION: ${mission.description}\nUSER REQUEST: ${specificRequest}\n\nTASK: Create a strict Step-by-Step Execution Plan in Markdown.`
    );

    // 5. SALVATAGGIO ASSET E PASSAGGIO DI STATO
    await db.updateTable('missions')
        .set({
            final_work_content: candidacy,
            final_deliverable_json: bonusJsonRaw, 
            analysis_notes: strategicPlan, // La "Timeline Sacra"
            last_user_request: specificRequest,
            last_agent_response: strategicPlan,
            conversation_history: JSON.stringify([
                { role: 'user', content: specificRequest },
                { role: 'assistant', content: strategicPlan }
            ]),
            status: 'active',
            updated_at: new Date()
        })
        .where('id', '=', mission.id)
        .execute();

    return `✅ **MISSIONE INIZIALIZZATA**
    
Ho elaborato la tua richiesta iniziale e preparato gli asset operativi:

1.  **Candidatura:** Pronta per l'invio.
2.  **Materiale Bonus:** Generato.
3.  **Piano Strategico:** Definita la roadmap.

Ecco il **Piano di Lavoro** che seguiremo:\n\n${strategicPlan}`;
  }

  /**
   * ==================================================================================
   * ⚔️ FASE 2: ESECUZIONE CON GUARDRAIL VETTORIALE (A3->A e B3->B)
   * Gestisce il loop chat quotidiano assicurando aderenza al piano e qualità.
   * ==================================================================================
   */
  private async runExecutionLoop(mission: any, userMessage: string): Promise<string> {
    console.log("🔄 AVVIO LOOP ESECUZIONE (Dual Guardrail A/B)...");

    // 1. RAG: Recupero Contesto Vettoriale (Esempi, Guide A1-A3, B1-B3)
    const ragContext = await this.ragService.retrieveContext(userMessage);

    // 2. COSTRUZIONE DEL "QUADRATO TATTICO" (Il Contesto Totale)
    // Include tutto lo storico per garantire coerenza
    const contextPacket = `
    === 🧭 MISSION COMPASS ===
    TITLE: ${mission.title}
    INITIAL REQUEST: ${mission.description}
    SPECIFIC USER GOAL (Origin): ${mission.last_user_request}
    
    === 🗺️ THE MAP (Approved Assets) ===
    CANDIDACY: ${mission.final_work_content}
    BONUS: ${mission.final_deliverable_json}
    STRATEGIC PLAN (The Roadmap): ${mission.analysis_notes}
    
    === 🧠 MEMORY STREAM ===
    LAST AGENT MSG: ${mission.last_agent_response}
    CURRENT INPUT: "${userMessage}"
    
    === 📚 RAG EXAMPLES ===
    ${ragContext}
    `;

    // 3. Prompt Worker (GPT-5.1)
    // Usa un prompt specifico per l'esecuzione del lavoro
    const workerPrompt = this.loadSystemPrompt('prompt_9_work_execution.md', 'developer') || 
                         this.loadSystemPrompt('prompt_worker.md', 'developer');

    console.log("📝 Worker generating draft...");
    let draft = await this.simpleGptCall(workerPrompt, contextPacket);
    
    // 4. GUARDRAIL LOOP (GPT Genera -> Gemini Giudica -> GPT Corregge)
    let loops = 0;
    let approved = false;

    while (!approved && loops < AI_CONFIG.system.max_loops) {
        console.log(`🛡️ Guardrail Check #${loops + 1}...`);
        
        // GEMINI GIUDICA (Zona A/B o A3/B3)
        const evaluation = await this.geminiJudge(contextPacket, draft);
        console.log(`📊 Vector Assessment: Zone ${evaluation.zone} (Score: ${evaluation.score})`);
        
        // LOGICA VETTORIALE
        // Zone A/B = Successo (Centro del bersaglio)
        if (evaluation.zone === 'A' || evaluation.zone === 'B') {
            approved = true;
            console.log(`✅ Approved.`);
        } else {
            // Zone A3/A2/A1 o B3/B2/B1 = Deviazione
            // Dobbiamo spostarci diagonalmente verso il centro
            console.warn(`⚠️ Deviation Detected: ${evaluation.zone}. Applying Diagonal Correction.`);
            
            let targetInstruction = "";
            if (evaluation.zone.startsWith('A')) {
                // Errore di Esecuzione (A3 -> A)
                targetInstruction = "Focus on EXECUTION ACCURACY. Adhere strictly to the Work Plan steps.";
            } else {
                // Errore di Strategia (B3 -> B)
                targetInstruction = "Focus on STRATEGIC ALIGNMENT. Ensure the tone and goal match the Mission Compass.";
            }

            const fixerPrompt = this.loadSystemPrompt('prompt_5_gpt_fixer_loop.md', 'developer');
            const correctionInput = `
            ORIGINAL DRAFT: ${draft}
            SUPERVISOR CRITIQUE (${evaluation.zone}): ${evaluation.feedback}
            
            ✅ VECTOR CORRECTION TASK:
            Rewrite the response moving from Zone ${evaluation.zone} to Zone A/B.
            ${targetInstruction}
            Fix logic and tone immediately.
            `;
            
            draft = await this.simpleGptCall(fixerPrompt || "You are a fixer. Correct the text.", correctionInput);
            loops++;
        }
    }

    // 5. AGGIORNAMENTO MEMORIA DB
    // Gestione sicura della history JSON
    let history = [];
    try {
        history = typeof mission.conversation_history === 'string' 
            ? JSON.parse(mission.conversation_history) 
            : (mission.conversation_history || []);
    } catch (e) { history = []; }

    const newHistory = [
        ...history, 
        { role: 'user', content: userMessage, timestamp: new Date() },
        { role: 'assistant', content: draft, timestamp: new Date() }
    ];

    await db.updateTable('missions')
        .set({
            last_user_request: userMessage,
            last_agent_response: draft,
            conversation_history: JSON.stringify(newHistory), // Salviamo tutto il thread
            updated_at: new Date()
        })
        .where('id', '=', mission.id)
        .execute();

    return draft;
  }

  // ==================================================================================
  // 🧠 MOTORI AI
  // ==================================================================================

  /**
   * GPT-5.1 (Worker/Fixer): Genera il contenuto.
   */
  private async simpleGptCall(sysPrompt: string, userContext: string = ""): Promise<string> {
    try {
        const response = await this.openai.chat.completions.create({
            model: AI_CONFIG.openai.model, // gpt-5.1-chat-latest
            messages: [
                { role: "system", content: sysPrompt },
                { role: "user", content: userContext }
            ]
            // NOTA: Niente temperature per modelli O1/Reasoning
        });
        return response.choices[0].message.content || "";
    } catch (e: any) {
        console.error("GPT Error:", e.message);
        return "Errore generazione risposta.";
    }
  }

  /**
   * Gemini 2.5 (Judge): Valuta la risposta sulle coordinate A/B.
   */
  private async geminiJudge(context: string, draft: string): Promise<{ zone: string, score: number, feedback: string }> {
    // Carichiamo il prompt del Giudice (che definisce A3, A, B3, B)
    const judgePromptMd = this.loadSystemPrompt('system_guardrail_judge.md', 'guardrails');
    
    if (!judgePromptMd) return { zone: "A", score: 100, feedback: "No judge prompt found." };

    const fullPrompt = `
    ${judgePromptMd}
    
    --- INPUT DATA TO EVALUATE ---
    MISSION CONTEXT:
    ${context}

    DRAFT RESPONSE:
    ${draft}
    `;

    try {
        const result = await this.geminiModel.generateContent(fullPrompt);
        const responseText = result.response.text();
        
        // Parsing JSON robusto per Gemini
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                zone: parsed.zone || "B", // Default a B se manca
                score: parsed.score || 50,
                feedback: parsed.feedback || "Generic error"
            };
        }
        console.warn("⚠️ Gemini Judge JSON parsing failed. Text:", responseText);
        return { zone: "B", score: 70, feedback: "JSON parsing failed, passing with caution." };

    } catch (e) {
        console.error("Gemini Judge Error:", e);
        return { zone: "A", score: 100, feedback: "Judge offline." }; // Fail open
    }
  }
}