import { Router, Response } from 'express';
import { db } from '../infra/db';
import { MissionManagerService } from '../services/mission-manager.service';
import { PerplexityService } from '../services/perplexity.service';
import { MissionDeveloperService } from '../services/mission-developer.service';
import { authMiddleware } from '../middleware/auth.middleware';

const missionsRouter = Router();

// Inizializzazione Servizi
const missionManager = new MissionManagerService();
const hunter = new PerplexityService();
const developer = new MissionDeveloperService();

/**
 * 🛡️ MIDDLEWARE DI PROTEZIONE
 * Applica il controllo JWT a tutte le rotte sottostanti.
 */
missionsRouter.use(authMiddleware as any);

/**
 * 📥 GET: Recupera le missioni dell'utente loggato
 */
missionsRouter.get('/my-missions', async (req: any, res: Response) => {
  try {
    const userId = req.user.userId;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const missions = await missionManager.getMissionsByUser(userId, limit);
    res.json(missions);
  } catch (e) {
    console.error("❌ [GET MY-MISSIONS] Errore:", e);
    res.status(500).json({ error: "Errore nel caricamento missioni." });
  }
});

/**
 * 🚀 POST: Avvio Caccia DAILY (Asincrona Anti-Crash)
 * Risponde istantaneamente per evitare il SIGTERM di Railway.
 */
missionsRouter.post('/hunt', async (req: any, res: Response) => {
  try {
    const userId = req.user.userId;

    // 1. Recupero immediato del profilo per la ricerca
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

    // 2. RISPOSTA IMMEDIATA
    // Chiudiamo la connessione HTTP. Railway vede "Successo" e non killa il container.
    res.status(202).json({ 
      success: true, 
      message: "Motore Sniper avviato. Le nuove missioni appariranno a breve." 
    });

    // 3. PROCESSO IN BACKGROUND
    // setImmediate garantisce che la risposta sopra venga inviata prima di iniziare questo blocco
    setImmediate(async () => {
      try {
        console.log(`📡 [ASYNC] Avvio caccia DAILY per ${userId}...`);
        const count = await hunter.findGrowthOpportunities(userId, manifesto, 'daily');
        console.log(`✅ [ASYNC] Caccia terminata. Trovate ${count} nuove missioni.`);
      } catch (err) {
        console.error("❌ [ASYNC ERROR] Errore durante la caccia background:", err);
      }
    });

  } catch (e) {
    console.error("❌ [HUNT] Errore inizializzazione:", e);
    if (!res.headersSent) {
      res.status(500).json({ error: "Impossibile avviare il motore di caccia." });
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

    res.status(202).json({ success: true, message: "Ricerca settimanale in corso." });

    setImmediate(async () => {
      try {
        await hunter.findGrowthOpportunities(userId, manifesto, 'weekly');
      } catch (err) {
        console.error("❌ [ASYNC WEEKLY] Errore:", err);
      }
    });
  } catch (e) {
    res.status(500).json({ error: "Errore caccia settimanale." });
  }
});

/**
 * 🧠 POST: Develop Mission (Analisi e Strategia)
 */
missionsRouter.post('/:id/develop', async (req: any, res: Response) => {
  try {
    const missionId = req.params.id;
    const initialInput = req.body.userInput || "Inizia analisi strategica.";
    const response = await developer.generateExecResponse(missionId, initialInput);
    res.json({ success: true, response });
  } catch (e: any) {
    res.status(500).json({ error: "Errore nello sviluppo della strategia." });
  }
});

/**
 * 💬 POST: Chat interattiva sulla missione
 */
missionsRouter.post('/:id/chat', async (req: any, res: Response) => {
  try {
    const missionId = req.params.id;
    const userMessage = req.body.message;
    if (!userMessage) return res.status(400).json({ error: "Messaggio mancante." });

    const response = await developer.generateExecResponse(missionId, userMessage);
    res.json({ reply: response });
  } catch (e: any) {
    res.status(500).json({ error: "Errore nella comunicazione con l'AI." });
  }
});

/**
 * ✅ POST: Segna come completata
 */
missionsRouter.post('/:id/complete', async (req: any, res: Response) => {
  try {
    const missionId = req.params.id;
    await developer.completeMission(missionId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: "Errore nel completamento missione." });
  }
});

/**
 * 🗑️ DELETE: Elimina missione
 */
missionsRouter.delete('/:id', async (req: any, res: Response) => {
  try {
    const userId = req.user.userId;
    await db.deleteFrom('missions')
      .where('id', '=', req.params.id)
      .where('user_id', '=', userId)
      .execute();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Errore nella cancellazione." });
  }
});

export { missionsRouter };