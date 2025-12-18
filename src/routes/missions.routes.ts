import { Router } from 'express';
import { db } from '../infra/db';
import { MissionManagerService } from '../services/mission-manager.service';
import { PerplexityService } from '../services/perplexity.service';
import { MissionDeveloperService } from '../services/mission-developer.service';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware'; // Importazione corretta

const missionsRouter = Router();

/**
 * 🛡️ APPLICAZIONE MIDDLEWARE GLOBALE
 * Questa riga assicura che req.user venga popolato decodificando il token JWT 
 * prima di procedere con le logiche delle rotte sottostanti.
 */
missionsRouter.use(authMiddleware as any);

const missionManager = new MissionManagerService();
const hunter = new PerplexityService();
const developer = new MissionDeveloperService();

// GET: Recupera le missioni dell'utente corrente
missionsRouter.get('/my-missions', async (req: any, res) => {
  try {
    const userId = req.user.userId; // Ora userId è accessibile grazie al middleware
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const missions = await missionManager.getMissionsByUser(userId, limit);
    res.json(missions);
  } catch (e) {
    console.error("❌ Errore GET /my-missions:", e);
    res.status(500).json({ error: "Errore recupero missioni" });
  }
});

// POST: Avvio caccia manuale (Daily)
missionsRouter.post('/hunt', async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const profile = await db.selectFrom('user_ai_profile')
      .selectAll()
      .where('user_id', '=', userId)
      .executeTakeFirst();
    
    let manifesto = {};
    if (profile && profile.career_goal_json) {
        manifesto = typeof profile.career_goal_json === 'string' 
          ? JSON.parse(profile.career_goal_json) 
          : profile.career_goal_json;
    }
    
    const count = await hunter.findGrowthOpportunities(userId, manifesto, 'daily');
    res.json({ success: true, count });
  } catch (e) {
    console.error("❌ Errore POST /hunt:", e);
    res.status(500).json({ error: "Errore durante la caccia" });
  }
});

// POST: Avvio caccia settimanale
missionsRouter.post('/hunt/weekly', async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const profile = await db.selectFrom('user_ai_profile')
      .selectAll()
      .where('user_id', '=', userId)
      .executeTakeFirst();
      
    let manifesto = {};
    if (profile && profile.career_goal_json) {
        manifesto = typeof profile.career_goal_json === 'string' 
          ? JSON.parse(profile.career_goal_json) 
          : profile.career_goal_json;
    }
    const count = await hunter.findGrowthOpportunities(userId, manifesto, 'weekly');
    res.json({ success: true, count });
  } catch (e) {
    console.error("❌ Errore POST /hunt/weekly:", e);
    res.status(500).json({ error: "Errore caccia weekly" });
  }
});

// POST: Inizializzazione Sviluppo Strategia (Fase Genesi)
missionsRouter.post('/:id/develop', async (req: any, res) => {
  try {
    const missionId = req.params.id;
    const initialInput = req.body.userInput || "Avvia analisi missione e prepara strategia.";
    
    // Utilizza l'Orchestratore per generare la risposta
    const response = await developer.generateExecResponse(missionId, initialInput);
    res.json({ success: true, response });
  } catch (e: any) {
    console.error("❌ Errore POST /develop:", e);
    res.status(500).json({ error: e.message || "Errore sviluppo strategia" });
  }
});

// POST: Chat Interattiva di Esecuzione
missionsRouter.post('/:id/chat', async (req: any, res) => {
  try {
    const missionId = req.params.id;
    const userMessage = req.body.message;
    
    if (!userMessage) return res.status(400).json({ error: "Messaggio vuoto" });

    const response = await developer.generateExecResponse(missionId, userMessage);
    res.json({ reply: response });
  } catch (e: any) {
    console.error("❌ Errore POST /chat:", e);
    res.status(500).json({ error: "Errore chat" });
  }
});

// POST: Completamento Missione
missionsRouter.post('/:id/complete', async (req: any, res) => {
  try {
    const missionId = req.params.id;
    await developer.completeMission(missionId);
    res.json({ success: true });
  } catch (e: any) {
    console.error("❌ Errore POST /complete:", e);
    res.status(500).json({ error: "Errore completamento" });
  }
});

// DELETE: Rimozione Missione (con controllo di proprietà)
missionsRouter.delete('/:id', async (req: any, res) => {
    try {
        const userId = req.user.userId;
        await db.deleteFrom('missions')
          .where('id', '=', req.params.id)
          .where('user_id', '=', userId) // Sicurezza: solo il proprietario può cancellare
          .execute();
        res.json({ success: true });
    } catch(e) { 
        console.error("❌ Errore DELETE missione:", e);
        res.status(500).json({error: "Errore cancellazione"}); 
    }
});

export { missionsRouter };