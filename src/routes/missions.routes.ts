import { Router } from 'express';
import { db } from '../infra/db';
import { PerplexityService } from '../services/perplexity.service';
import { MissionDeveloperService } from '../services/mission-developer.service';
import { authMiddleware } from '../middleware/auth.middleware';

export const missionsRouter = Router();
const perplexityService = new PerplexityService();
const developerService = new MissionDeveloperService();

// --- 1. CACCIA (HUNT) ---
missionsRouter.post('/hunt', authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user.userId;

    // Recupera il profilo dell'utente
    const profile = await db.selectFrom('user_ai_profile')
      .selectAll()
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (!profile) {
      return res.status(404).json({ error: "Profilo non trovato. Completa il setup." });
    }

    // Parsa il JSON del profilo
    const clientProfile = typeof profile.career_goal_json === 'string' 
      ? JSON.parse(profile.career_goal_json) 
      : profile.career_goal_json;

    // Avvia la caccia (Questo metodo lancia un errore se la quota è piena)
    await perplexityService.findGrowthOpportunities(userId, clientProfile);

    // Rispondi con successo e i dati trovati
    const newMissions = await db.selectFrom('missions')
        .selectAll()
        .where('user_id', '=', userId)
        .where('status', '=', 'pending')
        .orderBy('created_at', 'desc')
        .limit(10)
        .execute();

    res.json({ success: true, data: newMissions });

  } catch (error: any) {
    console.error("Errore Caccia:", error.message);
    
    // GESTIONE SPECIFICA ERRORE QUOTA
    if (error.message.includes("Quota")) {
        return res.status(403).json({ success: false, error: error.message });
    }
    
    res.status(500).json({ error: "Errore interno durante la caccia." });
  }
});

// --- 2. LISTA MISSIONI ---
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

// --- 3. SVILUPPO (DEVELOP) ---
missionsRouter.post('/:id/develop', authMiddleware, async (req: any, res) => {
  try {
    const result = await developerService.developStrategy(req.params.id);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ error: "Errore sviluppo strategia" });
  }
});

// --- 4. RIFIUTO (REJECT) ---
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

// --- 5. ACCETTAZIONE (STATUS) ---
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

// --- 6. ESECUZIONE (EXECUTE WORK) ---
missionsRouter.post('/:id/execute', authMiddleware, async (req: any, res) => {
  try {
    const { clientRequirements } = req.body;
    // Qui integreremo Gemini/OpenAI per fare il lavoro vero
    // Per ora simuliamo un output
    const output = `Lavoro eseguito per missione ${req.params.id}.\nInput Cliente: ${clientRequirements}\n\n[Output Generato dall'AI...]`;
    
    await db.updateTable('missions')
      .set({ 
        status: 'completed',
        final_work_content: output,
        client_requirements: clientRequirements
      })
      .where('id', '=', req.params.id)
      .execute();

    res.json({ success: true, data: output });
  } catch (e) {
    res.status(500).json({ error: "Errore esecuzione lavoro" });
  }
});