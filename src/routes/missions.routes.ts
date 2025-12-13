import { Router } from 'express';
import { db } from '../infra/db';
import { PerplexityService } from '../services/perplexity.service';
import { MissionDeveloperService } from '../services/mission-developer.service';
import { authMiddleware } from '../middleware/auth.middleware';

export const missionsRouter = Router();
const perplexityService = new PerplexityService();
const developerService = new MissionDeveloperService();

// --- HELPER PER ERRORI ---
const handleQuotaError = (error: any, res: any) => {
    console.error("Errore Caccia:", error.message);
    if (error.message.includes("Quota")) {
        return res.status(403).json({ success: false, error: error.message });
    }
    res.status(500).json({ error: "Errore interno durante la caccia." });
};

// --- HELPER RECUPERO MISSIONI ---
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

// 2. CACCIA WEEKLY
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

// 3. CACCIA MONTHLY
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

// 4. ALTRE ROTTE STANDARD
missionsRouter.get('/my-missions', authMiddleware, async (req: any, res) => {
  try {
    const limit = Number(req.query.limit) || 20;
    const missions = await db.selectFrom('missions').selectAll().where('user_id', '=', req.user.userId).orderBy('created_at', 'desc').limit(limit).execute();
    res.json({ success: true, data: missions });
  } catch (e) { res.status(500).json({ error: "Errore lista" }); }
});

missionsRouter.post('/:id/develop', authMiddleware, async (req: any, res) => {
  try {
    const result = await developerService.developStrategy(req.params.id);
    res.json({ success: true, data: result });
  } catch (e) { res.status(500).json({ error: "Errore develop" }); }
});

missionsRouter.post('/:id/execute', authMiddleware, async (req: any, res) => {
  try {
    const { clientRequirements, attachments } = req.body;
    const userId = req.user.userId;
    const userInput = (clientRequirements && clientRequirements.trim().length > 0) ? clientRequirements : "Procedi.";
    
    const result = await developerService.executeChatStep(req.params.id, userId, userInput, attachments || []);
    res.json({ success: true, data: result });
  } catch (e: any) { 
      const msg = e.message.includes("LIMITE") ? e.message : "Errore esecuzione.";
      res.status(500).json({ error: msg }); 
  }
});

// NUOVA ROTTA: CHIUSURA MISSIONE & PULIZIA MEMORIA
missionsRouter.post('/:id/complete', authMiddleware, async (req: any, res) => {
  try {
    await developerService.completeMission(req.params.id);
    res.json({ success: true, message: "Missione completata. Memoria cancellata." });
  } catch (e) { 
      res.status(500).json({ error: "Errore completamento missione." }); 
  }
});

missionsRouter.post('/:id/reject', authMiddleware, async (req: any, res) => {
    await db.updateTable('missions').set({ status: 'rejected' }).where('id', '=', req.params.id).execute();
    res.json({ success: true });
});

missionsRouter.patch('/:id/status', authMiddleware, async (req: any, res) => {
    await db.updateTable('missions').set({ status: req.body.status }).where('id', '=', req.params.id).execute();
    res.json({ success: true });
});