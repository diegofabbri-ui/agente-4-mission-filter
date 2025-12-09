import { Router } from 'express';
import { db } from '../infra/db';
import { PerplexityService } from '../services/perplexity.service';
import { MissionDeveloperService } from '../services/mission-developer.service';
import { authMiddleware } from '../middleware/auth.middleware';

export const missionsRouter = Router();
const perplexityService = new PerplexityService();
const developerService = new MissionDeveloperService();

// --- HELPER PER GESTIRE ERRORI E QUOTE ---
const handleQuotaError = (error: any, res: any) => {
    console.error("Errore Caccia:", error.message);
    if (error.message.includes("Quota")) {
        return res.status(403).json({ success: false, error: error.message });
    }
    res.status(500).json({ error: "Errore interno durante la caccia." });
};

// --- HELPER PER RECUPERARE MISSIONI ---
async function fetchNewMissions(userId: string) {
    return await db.selectFrom('missions')
        .selectAll()
        .where('user_id', '=', userId)
        .where('status', '=', 'pending')
        .orderBy('created_at', 'desc')
        .limit(10)
        .execute();
}

// 1. CACCIA DAILY
missionsRouter.post('/hunt', authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const profile = await db.selectFrom('user_ai_profile').selectAll().where('user_id', '=', userId).executeTakeFirst();
    if (!profile) return res.status(404).json({ error: "Profilo non trovato." });
    
    const clientProfile = typeof profile.career_goal_json === 'string' ? JSON.parse(profile.career_goal_json) : profile.career_goal_json;
    
    await perplexityService.findGrowthOpportunities(userId, clientProfile, 'daily');
    const newMissions = await fetchNewMissions(userId);
    res.json({ success: true, data: newMissions });
  } catch (error: any) { handleQuotaError(error, res); }
});

// 2. CACCIA WEEKLY (Ecco la rotta che mancava/dava 404)
missionsRouter.post('/hunt/weekly', authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const profile = await db.selectFrom('user_ai_profile').selectAll().where('user_id', '=', userId).executeTakeFirst();
    if (!profile) return res.status(404).json({ error: "Profilo non trovato." });

    const clientProfile = typeof profile.career_goal_json === 'string' ? JSON.parse(profile.career_goal_json) : profile.career_goal_json;

    await perplexityService.findGrowthOpportunities(userId, clientProfile, 'weekly');
    const newMissions = await fetchNewMissions(userId);
    res.json({ success: true, data: newMissions });
  } catch (error: any) { handleQuotaError(error, res); }
});

// 3. CACCIA MONTHLY (Ecco l'altra rotta mancante)
missionsRouter.post('/hunt/monthly', authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const profile = await db.selectFrom('user_ai_profile').selectAll().where('user_id', '=', userId).executeTakeFirst();
    if (!profile) return res.status(404).json({ error: "Profilo non trovato." });

    const clientProfile = typeof profile.career_goal_json === 'string' ? JSON.parse(profile.career_goal_json) : profile.career_goal_json;

    await perplexityService.findGrowthOpportunities(userId, clientProfile, 'monthly');
    const newMissions = await fetchNewMissions(userId);
    res.json({ success: true, data: newMissions });
  } catch (error: any) { handleQuotaError(error, res); }
});

// 4. LISTA
missionsRouter.get('/my-missions', authMiddleware, async (req: any, res) => {
  try {
    const limit = Number(req.query.limit) || 20;
    const missions = await db.selectFrom('missions').selectAll().where('user_id', '=', req.user.userId).orderBy('created_at', 'desc').limit(limit).execute();
    res.json({ success: true, data: missions });
  } catch (e) { res.status(500).json({ error: "Errore lista" }); }
});

// 5. DEVELOP
missionsRouter.post('/:id/develop', authMiddleware, async (req: any, res) => {
  try {
    const result = await developerService.developStrategy(req.params.id);
    res.json({ success: true, data: result });
  } catch (e) { res.status(500).json({ error: "Errore develop" }); }
});

// 6. EXECUTE (CHAT MODE)
missionsRouter.post('/:id/execute', authMiddleware, async (req: any, res) => {
  try {
    const { clientRequirements, attachments } = req.body;
    const userId = req.user.userId;
    // Input di default se vuoto
    const userInput = (clientRequirements && clientRequirements.trim().length > 0) ? clientRequirements : "Procedi con il prossimo step.";
    
    const result = await developerService.executeChatStep(req.params.id, userId, userInput, attachments || []);
    res.json({ success: true, data: result });
  } catch (e: any) { 
      const msg = e.message.includes("LIMITE") ? e.message : "Errore esecuzione.";
      res.status(500).json({ error: msg }); 
  }
});

// 7. STATUS & REJECT
missionsRouter.post('/:id/reject', authMiddleware, async (req: any, res) => {
    await db.updateTable('missions').set({ status: 'rejected' }).where('id', '=', req.params.id).execute();
    res.json({ success: true });
});
missionsRouter.patch('/:id/status', authMiddleware, async (req: any, res) => {
    await db.updateTable('missions').set({ status: req.body.status }).where('id', '=', req.params.id).execute();
    res.json({ success: true });
});