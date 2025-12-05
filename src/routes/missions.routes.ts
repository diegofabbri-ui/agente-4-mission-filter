import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { authMiddleware, AuthRequest, generateAccessToken } from '../middleware/auth.middleware';

// Importa i Servizi
import { MissionDeveloperService } from '../services/mission-developer.service'; 
import { MissionManagerService } from '../services/mission-manager.service'; // Ora esiste!
import { PerplexityService } from '../services/perplexity.service'; 

export const missionsRouter = Router();

// --- UTILS ---
function asyncHandler(fn: any) { return (req: any, res: any, next: any) => Promise.resolve(fn(req, res, next)).catch(next); }
function validateBody(schema: any) { return (req: any, res: any, next: any) => { const r = schema.safeParse(req.body); if (!r.success) return res.status(400).json(r.error); req.bodyParsed = r.data; next(); }; }
function validateQuery(schema: any) { return (req: any, res: any, next: any) => { const r = schema.safeParse(req.query); if (!r.success) return res.status(400).json(r.error); req.queryParsed = r.data; next(); }; }

// --- SCHEMAS ---
const addMissionSchema = z.object({ title: z.string(), description: z.string().optional(), rewardAmount: z.number().optional(), deadline: z.string().optional(), sourceUrl: z.string().optional() });
const updateStatusSchema = z.object({ status: z.enum(['pending', 'developed', 'applied', 'interviewing', 'active', 'completed', 'rejected', 'archived']) });
const addMessageSchema = z.object({ content: z.string().min(1) });
const executeWorkSchema = z.object({ clientRequirements: z.string().min(10) });

// --- ROTTE PROTETTE ---
missionsRouter.use(authMiddleware);

// 1. CACCIA (Hunter)
missionsRouter.post('/hunt', asyncHandler(async (req: AuthRequest, res: any) => {
    const db = req.app.get('db');
    const userId = req.user!.userId;
    const profile = await db.selectFrom('user_ai_profile').select('career_manifesto').where('user_id', '=', userId).executeTakeFirst();
    if (!profile?.career_manifesto) return res.status(400).json({ error: "Profilo/Manifesto non compilato." });

    const hunter = new PerplexityService();
    await hunter.findGrowthOpportunities(userId, profile.career_manifesto as any);
    const newMissions = await db.selectFrom('missions').selectAll().where('user_id', '=', userId).orderBy('created_at', 'desc').limit(5).execute();
    return res.json({ success: true, data: newMissions });
}));

// 2. SVILUPPO CANDIDATURA
missionsRouter.post('/:id/develop', asyncHandler(async (req: AuthRequest, res: any) => {
    const developerService = new MissionDeveloperService(); 
    const result = await developerService.executeMission(req.params.id, req.user!.userId);
    return res.json({ success: true, data: result });
}));

// 3. ESECUZIONE LAVORO FINALE
missionsRouter.post('/:id/execute', validateBody(executeWorkSchema), asyncHandler(async (req: AuthRequest, res: any) => {
    const db = req.app.get('db');
    const { clientRequirements } = (req as any).bodyParsed;

    await db.updateTable('missions').set({ status: 'active', client_requirements: clientRequirements, updated_at: new Date().toISOString() as any }).where('id', '=', req.params.id).execute();

    const developerService = new MissionDeveloperService();
    const finalWork = await developerService.executeFinalWork(req.params.id, req.user!.userId, clientRequirements);
      
    await db.updateTable('missions').set({ final_work_content: finalWork, status: 'completed', updated_at: new Date().toISOString() as any }).where('id', '=', req.params.id).execute();
    return res.json({ success: true, status: 'completed', data: finalWork });
}));

// 4. CRM (Chat & Stati)
missionsRouter.get('/my-missions', asyncHandler(async (req: AuthRequest, res: any) => {
    const db = req.app.get('db');
    const items = await db.selectFrom('missions').selectAll().where('user_id', '=', req.user!.userId).orderBy('created_at', 'desc').limit(50).execute();
    return res.json({ data: items });
}));

missionsRouter.patch('/:id/status', validateBody(updateStatusSchema), asyncHandler(async (req: AuthRequest, res: any) => {
    const managerService = new MissionManagerService();
    await managerService.updateStatus(req.params.id, req.user!.userId, (req as any).bodyParsed.status);
    return res.json({ success: true });
}));

missionsRouter.post('/:id/reject', asyncHandler(async (req: AuthRequest, res: any) => {
    const managerService = new MissionManagerService();
    await managerService.updateStatus(req.params.id, req.user!.userId, 'rejected');
    return res.json({ success: true, status: 'rejected' });
}));

missionsRouter.get('/:id/thread', asyncHandler(async (req: AuthRequest, res: any) => {
    const managerService = new MissionManagerService();
    const thread = await managerService.getThreadHistory(req.params.id);
    return res.json({ thread });
}));

missionsRouter.post('/:id/message', validateBody(addMessageSchema), asyncHandler(async (req: AuthRequest, res: any) => {
    const managerService = new MissionManagerService();
    await managerService.addMessage(req.params.id, req.user!.userId, 'user', (req as any).bodyParsed.content);
    const profile = await req.app.get('db').selectFrom('user_ai_profile').select('career_manifesto').where('user_id', '=', req.user!.userId).executeTakeFirst();
    const reply = await managerService.generateReply(req.params.id, req.user!.userId, profile?.career_manifesto || {});
    return res.json({ success: true, assistantReply: reply });
}));

export default missionsRouter;