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
    const profile = await db.selectFrom('user_ai_profile').selectAll().where('user_id', '=', userId).executeTakeFirst();

    if (!profile) return res.status(404).json({ error: "Profilo non trovato." });

    const clientProfile = typeof profile.career_goal_json === 'string' 
      ? JSON.parse(profile.career_goal_json) 
      : profile.career_goal_json;

    await perplexityService.findGrowthOpportunities(userId, clientProfile);

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
    if (error.message.includes("Quota")) return res.status(403).json({ success: false, error: error.message });
    res.status(500).json({ error: "Errore interno caccia." });
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
  } catch (e) { res.status(500).json({ error: "Errore recupero missioni" }); }
});

// --- 3. SVILUPPO STRATEGIA (DEVELOP) ---
missionsRouter.post('/:id/develop', authMiddleware, async (req: any, res) => {
  try {
    const result = await developerService.developStrategy(req.params.id);
    res.json({ success: true, data: result });
  } catch (e: any) {
    console.error("Errore Sviluppo:", e);
    res.status(500).json({ error: "Errore generazione strategia. Controlla OpenAI Key." });
  }
});

// --- 4. RIFIUTO ---
missionsRouter.post('/:id/reject', authMiddleware, async (req: any, res) => {
  try {
    await db.updateTable('missions').set({ status: 'rejected' }).where('id', '=', req.params.id).execute();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Errore rifiuto" }); }
});

// --- 5. ACCETTAZIONE ---
missionsRouter.patch('/:id/status', authMiddleware, async (req: any, res) => {
  try {
    await db.updateTable('missions').set({ status: req.body.status }).where('id', '=', req.params.id).execute();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Errore status" }); }
});

// --- 6. ESECUZIONE LAVORO REALE (EXECUTE WORK) ---
missionsRouter.post('/:id/execute', authMiddleware, async (req: any, res) => {
  try {
    const { clientRequirements, attachments } = req.body; // Riceve anche gli allegati
    const userId = req.user.userId;

    // Costruiamo il contesto completo per l'AI
    let fullInstructions = clientRequirements;
    
    // Se ci sono allegati, li aggiungiamo al prompt come contesto testuale
    if (attachments && attachments.length > 0) {
        fullInstructions += `\n\n--- ALLEGATI UTENTE ---\n`;
        attachments.forEach((file: any) => {
            fullInstructions += `\n[FILE: ${file.name}]\nContenuto/Contesto: ${file.content || '(File Binario/Immagine allegata)'}`;
        });
    }

    // CHIAMA IL SERVIZIO AI VERO (OpenAI/Gemini)
    const result = await developerService.executeFinalWork(req.params.id, userId, fullInstructions);

    // Salva il risultato nel DB
    await db.updateTable('missions')
      .set({ 
        status: 'completed',
        final_work_content: result,
        client_requirements: fullInstructions
      })
      .where('id', '=', req.params.id)
      .execute();

    res.json({ success: true, data: result });
  } catch (e: any) {
    console.error("Errore Esecuzione:", e);
    res.status(500).json({ error: "Errore esecuzione lavoro. Verificare OPENAI_API_KEY." });
  }
});