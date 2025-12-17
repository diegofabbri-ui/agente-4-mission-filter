import { Router } from 'express';
import { db } from '../infra/db';
import { MissionManagerService } from '../services/mission-manager.service';
import { PerplexityService } from '../services/perplexity.service';
import { MissionDeveloperService } from '../services/mission-developer.service'; // Il nuovo servizio
import { authMiddleware } from '../middleware/auth.middleware';

const missionsRouter = Router();
const missionManager = new MissionManagerService();
const hunter = new PerplexityService();
const developer = new MissionDeveloperService(); // Istanza del nuovo Orchestrator

// GET: Recupera le missioni
missionsRouter.get('/my-missions', async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const limit = req.query.limit ? parseInt(req.query.limit) : 50;
    const missions = await missionManager.getMissionsByUser(userId, limit);
    res.json(missions);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Errore recupero missioni" });
  }
});

// POST: Caccia Manuale (Daily)
missionsRouter.post('/hunt', async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const profile = await db.selectFrom('user_ai_profile').selectAll().where('user_id', '=', userId).executeTakeFirst();
    let manifesto = {};
    if (profile && profile.career_goal_json) {
        manifesto = typeof profile.career_goal_json === 'string' ? JSON.parse(profile.career_goal_json) : profile.career_goal_json;
    }
    
    // Eseguiamo la ricerca
    const count = await hunter.findGrowthOpportunities(userId, manifesto, 'daily');
    res.json({ success: true, count });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Errore durante la caccia" });
  }
});

// POST: Caccia Settimanale
missionsRouter.post('/hunt/weekly', async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const profile = await db.selectFrom('user_ai_profile').selectAll().where('user_id', '=', userId).executeTakeFirst();
    let manifesto = {};
    if (profile && profile.career_goal_json) {
        manifesto = typeof profile.career_goal_json === 'string' ? JSON.parse(profile.career_goal_json) : profile.career_goal_json;
    }
    const count = await hunter.findGrowthOpportunities(userId, manifesto, 'weekly');
    res.json({ success: true, count });
  } catch (e) {
    res.status(500).json({ error: "Errore caccia weekly" });
  }
});

// --- FIX ROUTE DEVELOP & CHAT ---
// Invece di developStrategy e executeChatStep, usiamo generateExecResponse per TUTTO.

// Vecchia rotta "develop": ora inizializza la missione tramite Orchestrator
missionsRouter.post('/:id/develop', async (req: any, res) => {
  try {
    const missionId = req.params.id;
    // Se non c'è input, usiamo un default per avviare la genesi
    const initialInput = req.body.userInput || "Avvia analisi missione e prepara strategia.";
    
    const response = await developer.generateExecResponse(missionId, initialInput);
    res.json({ success: true, response });
  } catch (e: any) { // Fix TS7006: specificare tipo 'any' o 'Error'
    console.error("Errore develop:", e);
    res.status(500).json({ error: e.message || "Errore sviluppo strategia" });
  }
});

// Vecchia rotta "chat": ora continua l'esecuzione tramite Orchestrator
missionsRouter.post('/:id/chat', async (req: any, res) => {
  try {
    const missionId = req.params.id;
    const userMessage = req.body.message;
    
    if (!userMessage) return res.status(400).json({ error: "Messaggio vuoto" });

    const response = await developer.generateExecResponse(missionId, userMessage);
    res.json({ reply: response });
  } catch (e: any) { // Fix TS7006
    console.error("Errore chat:", e);
    res.status(500).json({ error: "Errore chat" });
  }
});

// Rotta per completare/archiviare la missione
missionsRouter.post('/:id/complete', async (req: any, res) => {
  try {
    const missionId = req.params.id;
    await developer.completeMission(missionId); // Ora esiste nel service
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: "Errore completamento" });
  }
});

// Delete
missionsRouter.delete('/:id', async (req: any, res) => {
    try {
        await db.deleteFrom('missions').where('id', '=', req.params.id).execute();
        res.json({ success: true });
    } catch(e) { res.status(500).json({error: "Errore cancellazione"}); }
});

export { missionsRouter };