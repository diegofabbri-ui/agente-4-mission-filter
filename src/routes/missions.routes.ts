// src/routes/missions.routes.ts

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { authMiddleware, AuthRequest, generateAccessToken } from '../middleware/auth.middleware';

import {
  RawMissionInput,
  FilteredMission,
} from '../types/mission-filter.types';

export const missionsRouter = Router();

// ------------------------------
// Utils
// ------------------------------
function asyncHandler(
  fn: (req: AuthRequest, res: Response, next: NextFunction) => any,
) {
  return (req: AuthRequest, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);
}

function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const r = schema.safeParse(req.body);
    if (!r.success) {
      return res.status(400).json({ error: 'Bad request', details: r.error.flatten() });
    }
    (req as any).bodyParsed = r.data;
    next();
  };
}

function validateQuery<T extends z.ZodTypeAny>(schema: T) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const r = schema.safeParse(req.query);
    if (!r.success) {
      return res.status(400).json({ error: 'Invalid query', details: r.error.flatten() });
    }
    (req as any).queryParsed = r.data;
    next();
  };
}

// ------------------------------
// ZOD SCHEMAS
// ------------------------------

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const addMissionSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  rewardAmount: z.number().positive(),
  estimatedHours: z.number().positive(),
  deadline: z.string().datetime(),
  sourceUrl: z.string().url().optional(),
});

const myMissionsQuerySchema = z.object({
  status: z.enum(['pending', 'scored', 'archived']).optional(),
  limit: z
    .string()
    .optional()
    .transform((n) => (n ? Number(n) : 20))
    .pipe(z.number().int().min(1).max(100)),
  offset: z
    .string()
    .optional()
    .transform((n) => (n ? Number(n) : 0))
    .pipe(z.number().int().min(0)),
});

const filterAiBodySchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  rewardAmount: z.number().optional(),
  estimatedHours: z.number().optional(),
  deadline: z.string().datetime().optional(),
  sourceUrl: z.string().url().optional(),
});

const recommendedQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((n) => (n ? Number(n) : 10))
    .pipe(z.number().int().min(1).max(50)),
});

const missionDecisionSchema = z.object({
  feedbackRating: z.number().int().min(1).max(5).optional(),
});

const updateProfileSchema = z.object({
  fullName: z.string().optional(),
  minHourlyRate: z.number().optional(),
  preferredCategories: z.array(z.string()).optional(),
});

// ------------------------------------------------------------
// 1. REGISTER
// ------------------------------------------------------------
missionsRouter.post(
  '/auth/register',
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, password, fullName } = (req as any)
      .bodyParsed as z.infer<typeof registerSchema>;

    const db = req.app.get('db');

    const existing = await db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', email)
      .executeTakeFirst();

    if (existing) {
      return res.status(409).json({ error: 'Email già registrata' });
    }

    const userId = crypto.randomUUID();
    const hashed = crypto.createHash('sha256').update(password).digest('hex');

    await db
      .insertInto('users')
      .values({
        id: userId,
        email,
        password_hash: hashed,
        full_name: fullName ?? null,
      })
      .execute();

    await db
      .insertInto('user_ai_profile')
      .values({
        user_id: userId,
        skill_vector: {},
        weights: {
          x1_skillMatch: 0.15,
          x2_timeEfficiency: 0.15,
          x3_successProbability: 0.1,
          x4_scam: 0.2,
          x5_growth: 0.1,
          x6_utility: 0.1,
          x7_urgency: 0.1,
          x8_consistency: 0.05,
          x9_trust: 0.05,
        },
        learning_rate: 0.05,
        risk_tolerance: 0.5,
        beta_stats: { alpha: 5, beta: 5 },
      })
      .execute();

    const token = generateAccessToken({ userId, email });

    return res.status(201).json({
      user: { id: userId, email, fullName: fullName ?? null },
      token,
    });
  }),
);

// ------------------------------------------------------------
// 2. LOGIN
// ------------------------------------------------------------
missionsRouter.post(
  '/auth/login',
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = (req as any).bodyParsed;

    const db = req.app.get('db');

    const user = await db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', email)
      .executeTakeFirst();

    if (!user) return res.status(401).json({ error: 'Credenziali errate' });

    const hashed = crypto.createHash('sha256').update(password).digest('hex');

    if (user.password_hash !== hashed)
      return res.status(401).json({ error: 'Password errata' });

    const token = generateAccessToken({ userId: user.id, email });

    return res.json({
      user: { id: user.id, email },
      token,
    });
  }),
);

// ----------------------------------------------
// PROTECTED ROUTES
// ----------------------------------------------
missionsRouter.use(authMiddleware);

// ------------------------------------------------------------
// 3. ADD MISSION
// ------------------------------------------------------------
missionsRouter.post(
  '/missions/add',
  validateBody(addMissionSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const db = req.app.get('db');
    const userId = req.user!.userId;

    const body = (req as any).bodyParsed;
    const missionId = crypto.randomUUID();

    await db
      .insertInto('missions')
      .values({
        id: missionId,
        user_id: userId,
        title: body.title,
        description: body.description,
        reward_amount: body.rewardAmount,
        estimated_duration_hours: body.estimatedHours,
        deadline: new Date(body.deadline).toISOString(),
        source_url: body.sourceUrl ?? null,
        status: 'pending',
      })
      .execute();

    return res.status(201).json({
      missionId,
      ownerId: userId,
      status: 'created',
      data: body,
    });
  }),
);

// ------------------------------------------------------------
// 4. GET MY MISSIONS
// ------------------------------------------------------------
missionsRouter.get(
  '/missions/my-missions',
  validateQuery(myMissionsQuerySchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const db = req.app.get('db');
    const userId = req.user!.userId;
    const { status, limit, offset } = (req as any).queryParsed;

    let q = db
      .selectFrom('missions')
      .selectAll()
      .where('user_id', '=', userId);

    if (status) q = q.where('status', '=', status);

    const items: any[] = await q.limit(limit).offset(offset).execute();

    return res.json({
      data: items,
      meta: { total: items.length, limit, offset },
    });
  }),
);

// ------------------------------------------------------------
// 5. FILTER-AI
// ------------------------------------------------------------
missionsRouter.post(
  '/missions/:id/filter-ai',
  validateBody(filterAiBodySchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const missionId = req.params.id;
    const userId = req.user!.userId;

    const db = req.app.get('db');
    const missionFilterService = req.app.get('missionFilterService');

    const mission = await db
      .selectFrom('missions')
      .selectAll()
      .where('id', '=', missionId)
      .executeTakeFirst();

    if (!mission) {
      return res.status(404).json({ error: 'Missione non trovata' });
    }

    const raw: RawMissionInput = {
      id: mission.id,
      title: mission.title,
      description: mission.description ?? '',
      rewardAmount: Number(mission.reward_amount),
      estimatedHours: Number(mission.estimated_duration_hours),
      deadline: new Date(mission.deadline),
      sourceId: mission.source_url ?? 'unknown',
    };

    const results: FilteredMission[] =
      await missionFilterService.filterMissionsForUser(userId, [raw]);

    const scored = results[0];

    await db
      .insertInto('mission_filters')
      .values({
        mission_id: missionId,
        user_id: userId,
        total_score: scored.totalScore,
        factors_breakdown: scored.factors,
        is_scam: scored.isScam,
        scam_reason: scored.scamReason ?? null,
      })
      .onConflict((oc: any) =>
        oc.columns(['mission_id', 'user_id']).doUpdateSet({
          total_score: scored.totalScore,
          factors_breakdown: scored.factors,
          is_scam: scored.isScam,
          scam_reason: scored.scamReason ?? null,
        }),
      )
      .execute();

    await db
      .insertInto('ai_audit_log')
      .values({
        user_id: userId,
        mission_id: missionId,
        decision_type: scored.isScam ? 'SCAM_BLOCK' : 'HIGH_SCORE',
        explanation: scored.reasoning,
        snapshot_weights: scored.factors,
      })
      .execute();

    return res.json(scored);
  }),
);

// ------------------------------------------------------------
// 6. RECOMMENDED
// ------------------------------------------------------------
missionsRouter.get(
  '/missions/recommended',
  validateQuery(recommendedQuerySchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const db = req.app.get('db');
    const missionFilterService = req.app.get('missionFilterService');
    const userId = req.user!.userId;

    const { limit } = (req as any).queryParsed;

    const missions = await db
      .selectFrom('missions')
      .selectAll()
      .where('user_id', '=', userId)
      .where('status', '=', 'pending')
      .execute();

    const rawList: RawMissionInput[] = missions.map((m: any) => ({
      id: m.id,
      title: m.title,
      description: m.description ?? '',
      rewardAmount: Number(m.reward_amount),
      estimatedHours: Number(m.estimated_duration_hours),
      deadline: new Date(m.deadline),
      sourceId: m.source_url ?? 'unknown',
    }));

    const scored = await missionFilterService.filterMissionsForUser(
      userId,
      rawList,
    );

    const sorted = scored
      .filter((m: any) => !m.isScam)
      .sort((a: any, b: any) => b.totalScore - a.totalScore)
      .slice(0, limit);

    return res.json({
      userId,
      limit,
      data: sorted,
    });
  }),
);

// ------------------------------------------------------------
// 7. ACCEPT
// ------------------------------------------------------------
missionsRouter.post(
  '/missions/:id/accept',
  validateBody(missionDecisionSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const db = req.app.get('db');
    const aiProfileService = req.app.get('aiProfileService');

    const missionId = req.params.id;
    const userId = req.user!.userId;
    const { feedbackRating } = (req as any).bodyParsed;

    await db
      .insertInto('user_mission_history')
      .values({
        user_id: userId,
        mission_id: missionId,
        action: 'accepted',
        feedback_rating: feedbackRating ?? null,
      })
      .execute();

    const last = await db
      .selectFrom('mission_filters')
      .selectAll()
      .where('mission_id', '=', missionId)
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (last) {
      const filtered: FilteredMission = {
        missionId,
        userId,
        totalScore: last.total_score,
        isScam: last.is_scam,
        scamReason: last.scam_reason ?? null,
        factors: last.factors_breakdown,
        reasoning: '',
        normalizedMission: null as any,
      };

      await aiProfileService.updateProfileAfterMission(
        userId,
        filtered,
        'accepted',
      );
    }

    return res.json({
      missionId,
      userId,
      status: 'accepted',
      feedbackRating: feedbackRating ?? null,
    });
  }),
);

// ------------------------------------------------------------
// 8. COMPLETE
// ------------------------------------------------------------
missionsRouter.post(
  '/missions/:id/complete',
  validateBody(missionDecisionSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const db = req.app.get('db');
    const aiProfileService = req.app.get('aiProfileService');

    const missionId = req.params.id;
    const userId = req.user!.userId;
    const { feedbackRating } = (req as any).bodyParsed;

    await db
      .insertInto('user_mission_history')
      .values({
        user_id: userId,
        mission_id: missionId,
        action: 'completed',
        feedback_rating: feedbackRating ?? null,
      })
      .execute();

    await db
      .insertInto('earnings')
      .values({
        id: crypto.randomUUID(),
        user_id: userId,
        mission_id: missionId,
        amount: 0,
        status: 'verified',
      })
      .execute();

    const last = await db
      .selectFrom('mission_filters')
      .selectAll()
      .where('mission_id', '=', missionId)
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (last) {
      const filtered: FilteredMission = {
        missionId,
        userId,
        totalScore: last.total_score,
        isScam: last.is_scam,
        scamReason: last.scam_reason ?? null,
        factors: last.factors_breakdown,
        reasoning: '',
        normalizedMission: null as any,
      };

      await aiProfileService.updateProfileAfterMission(
        userId,
        filtered,
        'completed',
      );
    }

    return res.json({
      missionId,
      userId,
      status: 'completed',
      feedbackRating: feedbackRating ?? null,
    });
  }),
);

// ------------------------------------------------------------
// 9. UPDATE USER PROFILE
// ------------------------------------------------------------
missionsRouter.patch(
  '/user/profile',
  validateBody(updateProfileSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const db = req.app.get('db');
    const userId = req.user!.userId;
    const body = (req as any).bodyParsed;

    await db
      .updateTable('users')
      .set({
        full_name: body.fullName ?? undefined,
      })
      .where('id', '=', userId)
      .execute();

    return res.json({
      userId,
      updated: body,
    });
  }),
);

// ------------------------------------------------------------
// 10. USER DASHBOARD
// ------------------------------------------------------------
missionsRouter.get(
  '/user/dashboard',
  asyncHandler(async (req: AuthRequest, res) => {
    const db = req.app.get('db');
    const userId = req.user!.userId;

    const earnings: any[] = await db
      .selectFrom('earnings')
      .select(['amount'])
      .where('user_id', '=', userId)
      .execute();

    const history: any[] = await db
      .selectFrom('user_mission_history')
      .select(['action'])
      .where('user_id', '=', userId)
      .execute();

    const totalEarn = earnings.reduce(
      (acc: number, e: any) => acc + Number(e.amount),
      0,
    );

    const missionsCompleted = history.filter(
      (h: any) => h.action === 'completed',
    ).length;

    return res.json({
      userId,
      summary: {
        totalEarnings: totalEarn,
        missionsCompleted,
      },
    });
  }),
);
