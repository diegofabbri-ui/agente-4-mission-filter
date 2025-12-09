import { Router } from 'express';
import { db } from '../infra/db';
import { PerplexityService } from '../services/perplexity.service';
import { MissionDeveloperService } from '../services/mission-developer.service';
import { authMiddleware } from '../middleware/auth.middleware';

export const missionsRouter = Router();
const perplexityService = new PerplexityService();
const developerService = new MissionDeveloperService();

// ==================================================================================
// 1. CACCIA GIORNALIERA (DAILY HUNT)
// Target: Micro-task, Hourly, Quick Wins (Max 20 steps)
// ==================================================================================
missionsRouter.post('/hunt', authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const profile = await getProfile(userId);
    if (!profile) return res.status(404).json({ error: "Profilo non trovato." });

    // Caccia in modalità 'daily'
    await perplexityService.findGrowthOpportunities(userId, profile, 'daily');

    const newMissions = await fetchNewMissions(userId);
    res.json({ success: true, data: newMissions });

  } catch (error: any) {
    handleQuotaError(error, res);
  }
});

// ==================================================================================
// 2. CACCIA SETTIMANALE (WEEKLY SPRINT)
// Target: Fixed Price, 3.5h/week, Progetti definiti (Max 100 steps)
// ==================================================================================
missionsRouter.post('/hunt/weekly', authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const profile = await getProfile(userId);
    if (!profile) return res.status(404).json({ error: "Profilo non trovato." });

    // Qui in futuro puoi aggiungere il check: "È Lunedì?" o "Hai bonus settimanali?"
    
    // Caccia in modalità 'weekly'
    await perplexityService.findGrowthOpportunities(userId, profile, 'weekly');

    const newMissions = await fetchNewMissions(userId);
    res.json({ success: true, data: newMissions });

  } catch (error: any) {
    handleQuotaError(error, res);
  }
});

// ==================================================================================
// 3. CACCIA MENSILE (MONTHLY RETAINER)
// Target: High Ticket, Retainer, Recurring (Max 400 steps)
// ==================================================================================
missionsRouter.post('/hunt/monthly', authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const profile = await getProfile(userId);
    if (!profile) return res.status(404).json({ error: "Profilo non trovato." });

    // Qui in futuro puoi aggiungere il check: "È il 1° del mese?" o "Hai bonus mensili?"

    // Caccia in modalità 'monthly'
    await perplexityService.findGrowthOpportunities(userId, profile, 'monthly');

    const newMissions = await fetchNewMissions(userId);
    res.json({ success: true, data: newMissions });

  } catch (error: any) {
    handleQuotaError(error, res);
  }
});

// ==================================================================================
// 4. LISTA MISSIONI (GET)
// ==================================================================================
missionsRouter.get('/my-missions', authMiddleware, async (req: any, res) => {
  try {
    const limit = Number(req.query.limit) || 20;
    const missions = await db.selectFrom('missions')
      .selectAll()
      .where('user_id', '=', req.user.userId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute();
    
    res.json({ success: true, data: missions });
  } catch (e) {
    res.status(500).json({ error: "Errore recupero missioni" });
  }
});

// ==================================================================================
// 5. SVILUPPO STRATEGIA (LAYOUT 2 - DEVELOP)
// Genera Cover Letter e Bonus Asset
// ==================================================================================
missionsRouter.post('/:id/develop', authMiddleware, async (req: any, res) => {
  try {
    const result = await developerService.developStrategy(req.params.id);
    res.json({ success: true, data: result });
  } catch (e: any) {
    console.error("Errore Sviluppo:", e);
    res.status(500).json({ error: "Errore generazione strategia. Controlla OPENAI_API_KEY." });
  }
});

// ==================================================================================
// 6. ESECUZIONE LAVORO (LAYOUT 3 - EXECUTE / CHAT)
// Gestisce il Botta e Risposta, Memoria e Allegati
// ==================================================================================
missionsRouter.post('/:id/execute', authMiddleware, async (req: any, res) => {
  try {
    const { clientRequirements, attachments } = req.body;
    const userId = req.user.userId;

    // Se l'utente manda input vuoto (solo click), mettiamo un placeholder per attivare l'AI
    const userInput = clientRequirements && clientRequirements.trim().length > 0 
        ? clientRequirements 
        : "Procedi con il prossimo step logico.";

    // Chiamata al servizio "Chat Step" (Mantiene la memoria e non chiude la missione)
    const result = await developerService.executeChatStep(
        req.params.id, 
        userId, 
        userInput, 
        attachments || []
    );

    res.json({ success: true, data: result });

  } catch (e: any) {
    console.error("Errore Esecuzione:", e);
    // Gestione errore pulita per il frontend
    const errorMsg = e.message.includes("LIMITE MISSIONE") 
        ? e.message 
        : "Errore esecuzione lavoro. Verificare OPENAI_API_KEY.";
    
    res.status(500).json({ error: errorMsg });
  }
});

// ==================================================================================
// 7. GESTIONE STATO (RIFIUTA / ACCETTA / ARCHIVIA)
// ==================================================================================

// Rifiuta Missione
missionsRouter.post('/:id/reject', authMiddleware, async (req: any, res) => {
  try {
    await db.updateTable('missions')
      .set({ status: 'rejected' })
      .where('id', '=', req.params.id)
      .execute();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Errore rifiuto" });
  }
});

// Cambia Stato Manualmente
missionsRouter.patch('/:id/status', authMiddleware, async (req: any, res) => {
  try {
    const { status } = req.body;
    await db.updateTable('missions')
      .set({ status })
      .where('id', '=', req.params.id)
      .execute();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Errore aggiornamento stato" });
  }
});


// ==================================================================================
// HELPER PRIVATI
// ==================================================================================

async function getProfile(userId: string) {
    const profile = await db.selectFrom('user_ai_profile')
      .selectAll()
      .where('user_id', '=', userId)
      .executeTakeFirst();
    
    if (!profile) return null;

    return typeof profile.career_goal_json === 'string' 
      ? JSON.parse(profile.career_goal_json) 
      : profile.career_goal_json;
}

async function fetchNewMissions(userId: string) {
    return await db.selectFrom('missions')
        .selectAll()
        .where('user_id', '=', userId)
        .where('status', '=', 'pending')
        .orderBy('created_at', 'desc')
        .limit(10)
        .execute();
}

function handleQuotaError(error: any, res: any) {
    console.error("Errore Caccia:", error.message);
    if (error.message.includes("Quota")) {
        return res.status(403).json({ success: false, error: error.message });
    }
    res.status(500).json({ error: "Errore interno durante la caccia." });
}