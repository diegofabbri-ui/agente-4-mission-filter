import { Router } from 'express';
import { db } from '../infra/db';
import { authMiddleware } from '../middleware/auth.middleware';
import crypto from 'crypto';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

const userRouter = Router();
userRouter.use(authMiddleware);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- HELPER: Carica il Prompt dal File MD ---
function loadSystemPrompt(): string {
  try {
    const isProd = process.env.NODE_ENV === 'production';
    const basePath = isProd ? path.join(process.cwd(), 'dist') : path.join(process.cwd(), 'src');
    const filePath = path.join(basePath, 'knowledge_base', 'system_ai_keyword_generator.md');
    
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
    // Fallback di emergenza se il file non si trova
    return `You are an SEO expert. Output valid JSON with "positive_keywords" and "negative_keywords" arrays based on user input.`;
  } catch (e) {
    console.error("Errore lettura prompt keyword:", e);
    return "";
  }
}

// --- FUNZIONE GENERATRICE (Usa il Prompt MD) ---
async function generateStrategicKeywords(dreamRole: string, whatToDo: string, whatToAvoid: string) {
  try {
    console.log("🤖 Avvio generazione keyword AI...");
    
    const systemPrompt = loadSystemPrompt(); // Carica il file MD

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // O "gpt-4-turbo", il modello più smart che hai
      messages: [
        { role: "system", content: systemPrompt },
        { 
          role: "user", 
          content: `TARGET ROLE: ${dreamRole}\nDESIRES: ${whatToDo}\nAVOIDANCE: ${whatToAvoid}` 
        }
      ],
      response_format: { type: "json_object" }, // Forza output JSON garantito
      temperature: 0.3 // Bassa creatività, alta precisione
    });

    const content = response.choices[0].message.content;
    return JSON.parse(content || '{"positive_keywords":[], "negative_keywords":[]}');
  } catch (e) {
    console.error("⚠️ Errore AI:", e);
    return { positive_keywords: [dreamRole], negative_keywords: [] };
  }
}

// GET: Recupera Profilo
userRouter.get('/profile-data', async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const profile = await db.selectFrom('user_ai_profile').selectAll().where('user_id', '=', userId).executeTakeFirst();
    if (!profile) return res.json(null);

    const manifesto = typeof profile.career_goal_json === 'string' 
      ? JSON.parse(profile.career_goal_json) 
      : (profile.career_goal_json || {});

    res.json({
      minHourlyRate: profile.min_hourly_rate,
      careerManifesto: manifesto
    });
  } catch (e) {
    res.status(500).json({ error: "Errore server" });
  }
});

// PATCH: Aggiorna & Resetta
userRouter.patch('/profile', async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const { minHourlyRate, dreamRole, whatToDo, whatToAvoid, advancedInstructions } = req.body;

    if (!dreamRole) return res.status(400).json({ error: "Obiettivo mancante" });

    // 1. GENERA KEYWORDS USANDO IL PROMPT MD
    const aiKeywords = await generateStrategicKeywords(dreamRole, whatToDo, whatToAvoid);

    // 2. SALVA I DATI
    const newManifesto = {
      dreamRole,
      whatToDo,
      whatToAvoid,
      advancedInstructions,
      generatedSearchLogic: aiKeywords // Le keyword pulite salvate qui
    };

    const manifestoJson = JSON.stringify(newManifesto);
    const now = new Date();

    const exists = await db.selectFrom('user_ai_profile').select('id').where('user_id', '=', userId).executeTakeFirst();

    if (exists) {
      await db.updateTable('user_ai_profile')
        .set({
          min_hourly_rate: minHourlyRate || 0,
          career_goal_json: manifestoJson,
          updated_at: now
        })
        .where('user_id', '=', userId)
        .execute();
    } else {
      await db.insertInto('user_ai_profile')
        .values({
          id: crypto.randomUUID(),
          user_id: userId,
          full_name: "User",
          min_hourly_rate: minHourlyRate || 0,
          career_goal_json: manifestoJson,
          weights: JSON.stringify({}),
          created_at: now,
          updated_at: now
        })
        .execute();
    }

    // 3. RESET CACCIA
    await db.deleteFrom('missions')
      .where('user_id', '=', userId)
      .where('status', '!=', 'completed')
      .execute();

    console.log(`✅ Profilo aggiornato. Keyword generate:`, aiKeywords);
    res.json({ success: true });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Errore aggiornamento" });
  }
});

export { userRouter };