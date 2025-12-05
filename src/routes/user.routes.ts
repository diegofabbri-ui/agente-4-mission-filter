import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';

const userRouter = Router();

// Middleware di protezione
userRouter.use(authMiddleware);

// GET /api/user/profile-data
userRouter.get('/profile-data', async (req: any, res) => {
  try {
    const db = req.app.get('db');
    const userId = req.user!.userId;

    const user = await db.selectFrom('users')
      .select('full_name')
      .where('id', '=', userId)
      .executeTakeFirst();

    const profile = await db.selectFrom('user_ai_profile')
      .select('career_manifesto')
      .where('user_id', '=', userId)
      .executeTakeFirst();
      
    const prefs = await db.selectFrom('user_preferences')
      .select('min_hourly_rate')
      .where('user_id', '=', userId)
      .executeTakeFirst();

    return res.json({
      fullName: user?.full_name || "",
      minHourlyRate: prefs?.min_hourly_rate || 0,
      careerManifesto: profile?.career_manifesto || {}
    });
  } catch (e: any) {
    console.error("Error fetching profile:", e);
    return res.status(500).json({ error: "Errore server" });
  }
});

// PATCH /api/user/profile
userRouter.patch('/profile', async (req: any, res) => {
  try {
    const db = req.app.get('db');
    const userId = req.user!.userId;
    const body = req.body; // Validazione semplificata per il fix rapido

    // 1. Aggiorna User (Nome)
    if (body.fullName) {
      await db.updateTable('users')
        .set({ full_name: body.fullName })
        .where('id', '=', userId)
        .execute();
    }

    // 2. Aggiorna Preferenze (Tariffa)
    if (body.minHourlyRate) {
        // Verifica se esiste, altrimenti insert (upsert manuale)
        const exists = await db.selectFrom('user_preferences').where('user_id', '=', userId).executeTakeFirst();
        if (exists) {
            await db.updateTable('user_preferences').set({ min_hourly_rate: body.minHourlyRate }).where('user_id', '=', userId).execute();
        } else {
            await db.insertInto('user_preferences').values({ user_id: userId, min_hourly_rate: body.minHourlyRate }).execute();
        }
    }

    // 3. Aggiorna Manifesto AI
    if (body.careerManifesto) {
      const existingProfile = await db.selectFrom('user_ai_profile').where('user_id', '=', userId).executeTakeFirst();
      
      if (existingProfile) {
        await db.updateTable('user_ai_profile')
          .set({ 
            career_manifesto: JSON.stringify(body.careerManifesto),
            updated_at: new Date().toISOString() as any
          })
          .where('user_id', '=', userId)
          .execute();
      } else {
        await db.insertInto('user_ai_profile')
          .values({ 
            user_id: userId, 
            career_manifesto: JSON.stringify(body.careerManifesto),
            weights: JSON.stringify({}),
            created_at: new Date().toISOString() as any
          })
          .execute();
      }
    }

    return res.json({ success: true });
  } catch (e: any) {
    console.error("Error updating profile:", e);
    return res.status(500).json({ error: e.message });
  }
});

export default userRouter;