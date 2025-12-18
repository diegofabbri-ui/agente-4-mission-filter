import { Router, Response } from 'express';
import { db } from '../infra/db';
import { MissionManagerService } from '../services/mission-manager.service';
import { PerplexityService } from '../services/perplexity.service';
import { MissionDeveloperService } from '../services/mission-developer.service';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';

const missionsRouter = Router();

// Inizializzazione Servizi
const missionManager = new MissionManagerService();
const hunter = new PerplexityService();
const developer = new MissionDeveloperService();

/**
 * 🛡️ PROTEZIONE MIDDLEWARE
 * Applichiamo authMiddleware a tutte le rotte del router per garantire 
 * che req.user sia sempre popolato.
 */
missionsRouter.use(authMiddleware as any);

/**
 * 📥 GET: Recupera la lista delle missioni dell'utente
 */
missionsRouter.get('/my-missions', async (req: any, res: Response) => {
  try {
    const userId = req.user.userId;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const missions = await missionManager.getMissionsByUser(userId, limit);
    res.json(missions);
  } catch (e) {
    console.error("❌ Errore recupero missioni:", e);
    res.status(500).json({ error: "Errore nel caricamento delle missioni." });
  }
});

/**
 * 🚀 POST: Avvio Caccia DAILY (Asincrona)
 * Risponde subito per evitare il timeout di Railway/Aruba.
 */
missionsRouter.post('/hunt', async (req: any, res: Response) => {
  try {
    const userId = req.user.userId;

    // 1. Recupero rapido del profilo AI (DB)
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

    // 2. RISPOSTA IMMEDIATA: Confermiamo l'avvio al frontend
    res.json({ 
      success: true, 
      message: "Caccia 'Second Income' avviata in background. Le missioni appariranno a breve." 
    });

    // 3. ESECUZIONE IN BACKGROUND (senza await)
    // Non blocca la risposta HTTP, permettendo all'AI di prendersi il tempo necessario.
    hunter.findGrowthOpportunities(userId, manifesto, 'daily')
      .then(count => console.log(`✅ [BACKGROUND] Caccia Daily conclusa. Nuove missioni: ${count}`))
      .catch(err => console.error(`❌ [BACKGROUND] Errore durante la caccia Daily:`, err));

  } catch (e) {
    console.error("❌ Errore inizializzazione caccia:", e);
    if (!res.headersSent) {
      res.status(500).json({ error: "Impossibile avviare la caccia." });
    }
  }
});

/**
 * 📅 POST: Avvio Caccia WEEKLY (Asincrona)
 */
missionsRouter.post('/hunt/weekly', async (req: any, res: Response) => {
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

    res.json({ success: true, message: "Analisi settimanale avviata in background." });

    hunter.findGrowthOpportunities(userId, manifesto, 'weekly')
      .then(count => console.log(`✅ [BACKGROUND] Caccia Weekly conclusa: ${count}`))
      .catch(err => console.error(`❌ [BACKGROUND] Errore caccia Weekly:`, err));

  } catch (e) {
    res.status(500).json({ error: "Errore avvio caccia settimanale." });
  }
});

/**
 * 🧠 POST: Develop Mission (Analisi e Strategia)
 */
missionsRouter.post('/:id/develop', async (req: any, res: Response) => {
  try {
    const missionId = req.params.id;
    const initialInput = req.body.userInput || "Avvia analisi missione e prepara strategia.";
    const response = await developer.generateExecResponse(missionId, initialInput);
    res.json({ success: true, response });
  } catch (e: any) {
    console.error("❌ Errore sviluppo missione:", e);
    res.status(500).json({ error: e.message || "Errore durante lo sviluppo." });
  }
});

/**
 * 💬 POST: Chat Mission (Esecuzione guidata)
 */
missionsRouter.post('/:id/chat', async (req: any, res: Response) => {
  try {
    const missionId = req.params.id;
    const userMessage = req.body.message;
    if (!userMessage) return res.status(400).json({ error: "Messaggio vuoto." });

    const response = await developer.generateExecResponse(missionId, userMessage);
    res.json({ reply: response });
  } catch (e: any) {
    res.status(500).json({ error: "Errore nella comunicazione con l'AI." });
  }
});

/**
 * ✅ POST: Completa/Archivia Missione
 */
missionsRouter.post('/:id/complete', async (req: any, res: Response) => {
  try {
    const missionId = req.params.id;
    await developer.completeMission(missionId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: "Errore durante il completamento." });
  }
});

/**
 * 🗑️ DELETE: Rimuovi Missione
 */
missionsRouter.delete('/:id', async (req: any, res: Response) => {
    try {
        const userId = req.user.userId;
        await db.deleteFrom('missions')
          .where('id', '=', req.params.id)
          .where('user_id', '=', userId)
          .execute();
        res.json({ success: true });
    } catch(e) { 
        res.status(500).json({ error: "Errore durante la cancellazione." }); 
    }
});

export { missionsRouter };