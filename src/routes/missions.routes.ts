import { Router } from 'express';
import { db } from '../infra/db';
import { PerplexityService } from '../services/perplexity.service';
import { MissionDeveloperService } from '../services/mission-developer.service';
import { authMiddleware } from '../middleware/auth.middleware';

export const missionsRouter = Router();
const perplexityService = new PerplexityService();
const developerService = new MissionDeveloperService();

// ==================================================================================
// 1. CACCIA (HUNT) - Perplexity
// ==================================================================================
missionsRouter.post('/hunt', authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user.userId;

    // 1. Recupera il profilo per sapere cosa cercare
    const profile = await db.selectFrom('user_ai_profile')
      .selectAll()
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (!profile) {
      return res.status(404).json({ error: "Profilo non trovato. Completa il setup." });
    }

    // 2. Parsa il JSON del profilo
    const clientProfile = typeof profile.career_goal_json === 'string' 
      ? JSON.parse(profile.career_goal_json) 
      : profile.career_goal_json;

    // 3. Avvia la caccia (Lancia eccezione se Quota superata)
    await perplexityService.findGrowthOpportunities(userId, clientProfile);

    // 4. Restituisci le nuove missioni trovate
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
    
    // GESTIONE SPECIFICA ERRORE QUOTA (Restituisce 403 per notifica Frontend)
    if (error.message.includes("Quota")) {
        return res.status(403).json({ success: false, error: error.message });
    }
    
    res.status(500).json({ error: "Errore interno durante la caccia." });
  }
});

// ==================================================================================
// 2. LISTA MISSIONI (GET)
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
// 3. SVILUPPO STRATEGIA (DEVELOP) - Genera Cover Letter e Bonus
// ==================================================================================
missionsRouter.post('/:id/develop', authMiddleware, async (req: any, res) => {
  try {
    const result = await developerService.developStrategy(req.params.id);
    res.json({ success: true, data: result });
  } catch (e: any) {
    console.error("Errore Sviluppo:", e);
    res.status(500).json({ error: "Errore generazione strategia. Controlla OPENAI_API_KEY su Railway." });
  }
});

// ==================================================================================
// 4. RIFIUTO (REJECT)
// ==================================================================================
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

// ==================================================================================
// 5. ACCETTAZIONE (STATUS UPDATE)
// ==================================================================================
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
// 6. ESECUZIONE LAVORO (EXECUTE) - Loop Reversibile
// ==================================================================================
missionsRouter.post('/:id/execute', authMiddleware, async (req: any, res) => {
  try {
    const { clientRequirements, attachments } = req.body;
    const userId = req.user.userId;

    // 1. Costruzione Prompt con Testo + Allegati
    let fullInstructions = clientRequirements || "";
    
    // Se ci sono allegati (file letti dal frontend), li aggiungiamo al contesto
    if (attachments && attachments.length > 0) {
        fullInstructions += `\n\n--- ALLEGATI E DOCUMENTI UTENTE ---\n`;
        attachments.forEach((file: any, index: number) => {
            // Tronchiamo file enormi per sicurezza, ma 50k caratteri sono tanti
            const safeContent = file.content ? file.content.substring(0, 50000) : "(File vuoto)";
            fullInstructions += `\n[FILE ${index+1}: ${file.name} (${file.type})]\nCONTENUTO:\n${safeContent}\n-------------------\n`;
        });
    }

    // Se l'utente non ha scritto nulla, mettiamo un default per non mandare stringa vuota
    if (!fullInstructions.trim()) {
        fullInstructions = "Esegui il lavoro richiesto basandoti sulla strategia precedentemente approvata.";
    }

    // 2. Chiamata al servizio AI (OpenAI)
    // Il servizio ora leggerà anche la strategia precedente per mantenere coerenza
    const result = await developerService.executeFinalWork(req.params.id, userId, fullInstructions);

    // 3. Salvataggio nel DB
    // NOTA IMPORTANTE: NON impostiamo lo status a 'completed'.
    // Lasciandolo invariato (o 'active'), permettiamo all'utente di premere di nuovo il tasto
    // nel frontend per rigenerare il lavoro se il risultato non piace.
    await db.updateTable('missions')
      .set({ 
        final_work_content: result,
        client_requirements: fullInstructions, // Salviamo il prompt usato per memoria
        // status: 'completed' <--- RIMOSSO PER PERMETTERE IL LOOP
      })
      .where('id', '=', req.params.id)
      .execute();

    res.json({ success: true, data: result });

  } catch (e: any) {
    console.error("Errore Esecuzione:", e);
    res.status(500).json({ error: "Errore esecuzione lavoro. Verificare OPENAI_API_KEY." });
  }
});