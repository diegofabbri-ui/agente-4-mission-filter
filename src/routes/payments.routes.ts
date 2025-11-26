// src/routes/payments.routes.ts

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { PaymentService } from '../services/payment.service';

const paymentsRouter = Router();
const paymentService = new PaymentService();

// ------------------------------------------------------------
// Helpers locali (stesso pattern di missions.routes.ts)
// ------------------------------------------------------------
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any> | any,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function validateBody(schema: z.ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation error',
        details: parsed.error.flatten(),
      });
    }
    (req as any).bodyParsed = parsed.data;
    next();
  };
}

// ------------------------------------------------------------
// Schemi Zod
// ------------------------------------------------------------
const commissionPreviewSchema = z.object({
  grossAmount: z.number().positive(),
  isPremium: z.boolean().optional(),
});

const premiumCheckoutSchema = z.object({
  successUrl: z.string().url(),
  cancelUrl: z.string().url().optional(),
});

// ------------------------------------------------------------
// ROTTE PROTETTE
// ------------------------------------------------------------
paymentsRouter.use(authMiddleware);

// ------------------------------------------------------------
// 1) PREVIEW COMMISSIONI PER UNA MISSIONE
// POST /payments/commission/preview
// ------------------------------------------------------------
paymentsRouter.post(
  '/payments/commission/preview',
  validateBody(commissionPreviewSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const db = req.app.get('db');
    const userId = req.user!.userId;
    const { grossAmount, isPremium = false } = (req as any).bodyParsed as z.infer<
      typeof commissionPreviewSchema
    >;

    const result = await paymentService.previewCommissionForUser(
      db,
      userId,
      grossAmount,
      new Date(),
      isPremium,
    );

    return res.json({
      userId,
      grossAmount,
      ...result,
    });
  }),
);

// ------------------------------------------------------------
// 2) CHECKOUT PREMIUM (Stripe Checkout Session)
// POST /payments/premium/checkout-session
// ------------------------------------------------------------
paymentsRouter.post(
  '/payments/premium/checkout-session',
  validateBody(premiumCheckoutSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const db = req.app.get('db');
    const userId = req.user!.userId;
    const { successUrl, cancelUrl } = (req as any).bodyParsed as z.infer<
      typeof premiumCheckoutSchema
    >;

    const session = await paymentService.createPremiumCheckoutSession(
      db,
      userId,
      successUrl,
      cancelUrl ?? successUrl,
    );

    return res.status(201).json({
      sessionId: session.id,
      url: session.url,
    });
  }),
);

export { paymentsRouter };
