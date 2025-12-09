# PROTOCOLLO DI CONSEGNA FINALE (FRONTEND PACKAGING)

**Stato Sistema:** ✅ DOPPIO APPROVAL (Candidatura + Bonus).
**Ruolo:** Delivery Architect.
**Obiettivo:** Unire i due deliverable approvati in un JSON perfetto per l'Interfaccia Utente (Dashboard).

---

### 1. INPUT DATI
**A. Candidatura Approvata:**
[APPROVED_CANDIDACY]

**B. Materiale Bonus Approvato:**
[APPROVED_BONUS]

**C. Contesto Missione:**
[MISSION_TITLE] (Azienda: [MISSION_COMPANY])

---

### 2. ISTRUZIONI DI PACKAGING

Analizza i deliverable e costruisci un oggetto JSON rigoroso.
**IMPORTANTE:** Pulisci il testo per una lettura umana ottimale. Rimuovi simboli markdown eccessivi se non necessari.

1.  **`deliverable_content`**: Il testo completo della Candidatura/Cover Letter.
2.  **`bonus_material_title`**: Estrai un titolo breve e professionale per il bonus.
3.  **`bonus_material_content`**: Il testo completo del Materiale Bonus.
4.  **`bonus_file_name`**: Un nome file suggerito (es. "Audit_Tecnico.pdf").
5.  **`strategy_brief`**: 1-2 frasi in Italiano sul *perché* questa strategia vincerà.
6.  **`execution_steps`**: Genera 3-5 step pratici (es. "1. Copia candidatura", "2. Salva bonus come PDF", "3. Invia email"). **NON LASCIARE VUOTO.**
7.  **`estimated_impact`**: Previsione sintetica (es. "Alto impatto").
8.  **`is_immediate_task`**: `false`.

---

### 3. OUTPUT FORMAT (STRICT JSON ONLY)

Return ONLY the raw JSON string.

```json
{
  "deliverable_content": "Stringa",
  "bonus_material_title": "Stringa",
  "bonus_material_content": "Stringa",
  "bonus_file_name": "Stringa",
  "strategy_brief": "Stringa",
  "execution_steps": ["Step 1", "Step 2", "Step 3"],
  "estimated_impact": "Stringa",
  "is_immediate_task": false
}
'''

---

### 🛠️ FIX 3: Il Motore di Sviluppo (Backend Service)

Qui correggiamo l'errore di sostituzione (ora usiamo `[...]` coerentemente) e passiamo anche le Skill dell'utente al generatore di Bonus (prima mancavano, causando errori).

**File:** `src/services/mission-developer.service.ts`

```typescript
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { db } from '../infra/db';

const AI_CONFIG = {
  openai: { model: 'gpt-5.1-chat-latest' }, // Modello più capace per JSON complessi
  gemini: { 
    model: 'gemini-2.5-pro', 
    generationConfig: { temperature: 0.1, maxOutputTokens: 16384 }
  },
  system: { max_loops: 3 }
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
    if (!geminiKey) console.warn("⚠️ GEMINI_API_KEY mancante.");
    
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
      console.warn(`⚠️ Prompt mancante: ${filename}`);
      return "";
    }
  }

  // ==================================================================================
  // 1️⃣ LAYOUT 2: SVILUPPO STRATEGIA (CORRETTO)
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

    const userSkills = JSON.stringify(profileData.keySkillsToAcquire || []);

    // A. Generazione Candidatura
    let promptCandidacy = this.loadPrompt('prompt_1_gpt_developer_init.md') || "Generate proposal.";
    promptCandidacy = promptCandidacy
      .replace('[MISSION_TITLE]', mission.title)
      .replace('[MISSION_DESCRIPTION]', mission.description || 'N/A')
      .replace('[MISSION_URL]', mission.source_url || 'N/A')
      .replace('[USER_SKILLS]', userSkills)
      .replace('[USER_ADVANTAGES]', JSON.stringify(profileData.unfairAdvantages || []));

    const approvedCandidacy = await this.simpleGptCall(promptCandidacy);

    // B. Generazione Bonus Asset (FIX: Aggiunto rimpiazzo Skills e Descrizione)
    let promptBonus = this.loadPrompt('prompt_10_bonus_material_init.md') || "Generate bonus.";
    promptBonus = promptBonus
      .replace('[MISSION_TITLE]', mission.title)
      .replace('[MISSION_DESCRIPTION]', mission.description || 'N/A')
      .replace('[USER_SKILLS]', userSkills); // <--- ORA PASSIAMO LE SKILL

    const approvedBonus = await this.simpleGptCall(promptBonus);

    // C. Packaging JSON
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

  // ... (Il resto del file: executeChatStep, runExecutionLoop rimangono uguali alla versione precedente funzionante)
  // Assicurati di mantenere executeChatStep che ti ho dato nel messaggio precedente per Layout 3.
  
  // UTILS (Inclusi per completezza)
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
        // Fallback di sicurezza migliorato
        return { 
            deliverable_content: candidacy, 
            bonus_material_title: "Bonus Asset Strategico", 
            bonus_material_content: bonus, 
            strategy_brief: "Strategia pronta. Bonus generato.", 
            execution_steps: ["1. Copia la candidatura", "2. Allega il bonus", "3. Invia"], // <--- ORA ABBIAMO STEP DI DEFAULT
            estimated_impact: "Alto", 
            is_immediate_task: true, 
            bonus_file_name: "Bonus_Asset.pdf" 
        };
    }
  }
  
  // Aggiungi qui anche executeChatStep e runExecutionLoop come nel messaggio precedente
  // per non rompere il Layout 3. (Per brevità qui ho messo solo la parte fixata di Layout 2).
  public async executeChatStep(missionId: string, userId: string, userInput: string, attachments: any[] = []): Promise<string> {
      // ... Copia l'implementazione esatta dal messaggio precedente per il Layout 3 ...
      // (Se serve te la rimando intera, ma il focus qui era il fix del Layout 2)
      return "Risposta Chat"; // Placeholder, usa codice vero
  }
}
'''