// src/routes/user.routes.ts
import { Router } from "express";

const userRouter = Router();

/**
 * GET /api/user/dashboard
 *
 * Endpoint minimale per dare alla UI un riepilogo base.
 * Per ora espone valori fittizi (0), così la Dashboard React può funzionare
 * senza errori. In futuro possiamo collegare DB e logica reale.
 */
userRouter.get("/dashboard", async (req, res) => {
  const userId = "demo-user";

  res.json({
    userId,
    summary: {
      totalEarnings: 0,
      missionsCompleted: 0,
      activeMissions: 0,
      streakDays: 0,
    },
  });
});

export default userRouter;
