import { Router } from 'express';
import { db } from '../infra/db';
import { authMiddleware } from '../middleware/auth.middleware';
import crypto from 'crypto';

const userRouter = Router();

userRouter.use(authMiddleware);

// GET /profile-data
userRouter.get('/profile-data', async (req: any, res) => {
  try {
    const userId = req.user.userId;
    // La selectAll() ora prenderà full_name e min_hourly_rate perché sono in db.ts
    const profile = await db.selectFrom('user_ai_profile')
      .selectAll()
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (!profile) return res.json(null);

    let manifesto = {};
    try {
        manifesto = typeof profile.career_goal_json === 'string' 
          ? JSON.parse(profile.career_goal_json) 
          : profile.career_goal_json;
    } catch (e) {}

    res.json({
      fullName: profile.full_name,
      minHourlyRate: profile.min_hourly_rate,
      careerManifesto: manifesto || {} 
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Errore server" });
  }
});

// PATCH /profile
userRouter.patch('/profile', async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const { fullName, minHourlyRate, careerManifesto } = req.body;

    if (!fullName) return res.status(400).json({ error: "Nome mancante" });

    // Verifica esistenza usando ID
    const exists = await db.selectFrom('user_ai_profile')
      .select('id') 
      .where('user_id', '=', userId)
      .executeTakeFirst();

    const now = new Date();
    const jsonVal = JSON.stringify(careerManifesto || {});

    if (exists) {
      await db.updateTable('user_ai_profile')
        .set({
          full_name: fullName,
          min_hourly_rate: minHourlyRate || 0,
          career_goal_json: jsonVal,
          updated_at: now
        })
        .where('user_id', '=', userId)
        .execute();
    } else {
      await db.insertInto('user_ai_profile')
        .values({
          id: crypto.randomUUID(),
          user_id: userId,
          full_name: fullName,
          min_hourly_rate: minHourlyRate || 0,
          career_goal_json: jsonVal,
          weights: JSON.stringify({}),
          created_at: now,
          updated_at: now
        })
        .execute();
    }

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Errore salvataggio" });
  }
});

export { userRouter };