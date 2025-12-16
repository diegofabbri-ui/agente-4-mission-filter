import { Router } from 'express';
import { db } from '../infra/db';
import { authMiddleware } from '../middleware/auth.middleware';
import crypto from 'crypto';

const userRouter = Router();

// Protezione globale delle rotte utente
userRouter.use(authMiddleware);

// ==================================================================================
// GET: Recupera i dati del profilo (Manifesto + Dati Anagrafici)
// ==================================================================================
userRouter.get('/profile-data', async (req: any, res) => {
  try {
    const userId = req.user.userId;

    const profile = await db.selectFrom('user_ai_profile')
      .selectAll()
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (!profile) {
      return res.json(null); // Nessun profilo ancora creato
    }

    // Parsing sicuro del JSON "Manifesto"
    let manifesto = {};
    try {
        // Se il driver DB restituisce già un oggetto, lo usiamo, altrimenti parsimiamo la stringa
        manifesto = typeof profile.career_goal_json === 'string' 
          ? JSON.parse(profile.career_goal_json) 
          : profile.career_goal_json;
    } catch (e) {
        console.warn(`[User ${userId}] JSON profilo corrotto o non valido.`);
    }

    // Mappatura DB -> Frontend
    res.json({
      fullName: profile.full_name,
      minHourlyRate: profile.min_hourly_rate,
      careerManifesto: manifesto || {} 
    });

  } catch (e) {
    console.error("Errore GET profile-data:", e);
    res.status(500).json({ error: "Errore recupero dati profilo" });
  }
});

// ==================================================================================
// PATCH: Salva o Aggiorna il profilo (Scrive il Manifesto nel DB)
// ==================================================================================
userRouter.patch('/profile', async (req: any, res) => {
  try {
    const userId = req.user.userId;
    // Dati in arrivo dal Frontend
    const { fullName, minHourlyRate, careerManifesto } = req.body;

    if (!fullName) {
        return res.status(400).json({ error: "Il nome è obbligatorio." });
    }

    // Verifica esistenza profilo
    const exists = await db.selectFrom('user_ai_profile')
      .select('id')
      .where('user_id', '=', userId)
      .executeTakeFirst();

    const now = new Date();
    // Serializziamo il manifesto per il salvataggio
    const manifestoJson = JSON.stringify(careerManifesto || {});

    if (exists) {
      // UPDATE
      await db.updateTable('user_ai_profile')
        .set({
          full_name: fullName,
          min_hourly_rate: minHourlyRate || 0,
          career_goal_json: manifestoJson, // Aggiorna il "Cervello" dell'agente
          updated_at: now
        })
        .where('user_id', '=', userId)
        .execute();
    } else {
      // INSERT (Primo salvataggio)
      await db.insertInto('user_ai_profile')
        .values({
          id: crypto.randomUUID(),
          user_id: userId,
          full_name: fullName,
          min_hourly_rate: minHourlyRate || 0,
          career_goal_json: manifestoJson,
          created_at: now,
          updated_at: now
        })
        .execute();
    }

    console.log(`✅ Profilo e Manifesto aggiornati per User: ${userId}`);
    res.json({ success: true, message: "Profilo salvato correttamente." });

  } catch (e) {
    console.error("Errore PATCH profile:", e);
    res.status(500).json({ error: "Errore durante il salvataggio del profilo." });
  }
});

export { userRouter };