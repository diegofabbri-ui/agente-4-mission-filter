import { Router } from 'express';
import { db } from '../infra/db';
import { authMiddleware } from '../middleware/auth.middleware';
import crypto from 'crypto';

const userRouter = Router();

// Protegge tutte le rotte utente con il middleware di autenticazione
userRouter.use(authMiddleware);

// ==================================================================================
// GET: Recupera i dati del profilo (incluso il Manifesto di Ricerca)
// ==================================================================================
userRouter.get('/profile-data', async (req: any, res) => {
  try {
    const userId = req.user.userId;

    // Recupera il profilo dal database
    const profile = await db.selectFrom('user_ai_profile')
      .selectAll()
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (!profile) {
      // Se non esiste ancora un profilo, restituisce null (il frontend gestirà i default)
      return res.json(null);
    }

    // Parsing sicuro del JSON salvato nel DB
    let manifesto = {};
    try {
        manifesto = typeof profile.career_goal_json === 'string' 
          ? JSON.parse(profile.career_goal_json) 
          : profile.career_goal_json;
    } catch (e) {
        console.warn("JSON profilo corrotto, uso oggetto vuoto.");
    }

    // Restituisce i dati formattati per il frontend
    res.json({
      fullName: profile.full_name,
      minHourlyRate: profile.min_hourly_rate,
      careerManifesto: manifesto || {} // Il "Cervello" dell'Agente per questo utente
    });

  } catch (e) {
    console.error("Errore recupero profilo:", e);
    res.status(500).json({ error: "Errore recupero dati profilo" });
  }
});

// ==================================================================================
// PATCH: Salva/Aggiorna il profilo (Scrive il Manifesto nel DB)
// ==================================================================================
userRouter.patch('/profile', async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const { fullName, minHourlyRate, careerManifesto } = req.body;

    // Verifica preliminare dei dati critici
    if (!fullName) {
        return res.status(400).json({ error: "Il nome è obbligatorio." });
    }

    // Verifica se il profilo esiste già per questo utente
    const exists = await db.selectFrom('user_ai_profile')
      .select('id')
      .where('user_id', '=', userId)
      .executeTakeFirst();

    const now = new Date();

    if (exists) {
      // UPDATE: Aggiorna il profilo esistente
      await db.updateTable('user_ai_profile')
        .set({
          full_name: fullName,
          min_hourly_rate: minHourlyRate || 0,
          career_goal_json: JSON.stringify(careerManifesto), // Qui salviamo il protocollo dinamico
          updated_at: now
        })
        .where('user_id', '=', userId)
        .execute();
    } else {
      // INSERT: Crea un nuovo profilo (Upsert manuale)
      await db.insertInto('user_ai_profile')
        .values({
          id: crypto.randomUUID(),
          user_id: userId,
          full_name: fullName,
          min_hourly_rate: minHourlyRate || 0,
          career_goal_json: JSON.stringify(careerManifesto),
          created_at: now,
          updated_at: now
        })
        .execute();
    }

    console.log(`✅ Profilo aggiornato per User: ${userId}`);
    res.json({ success: true, message: "Protocollo Agente aggiornato con successo." });

  } catch (e) {
    console.error("Errore salvataggio profilo:", e);
    res.status(500).json({ error: "Errore durante il salvataggio del profilo." });
  }
});

export { userRouter };