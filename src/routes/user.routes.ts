// src/routes/user.routes.ts
import { Router } from "express";

const userRouter = Router();

/**
 * GET /api/user/dashboard
 *
 * Questo endpoint fornisce un riepilogo base all'interfaccia.
 * È volutamente pubblico (nessuna richiesta di token).
 * In futuro, quando aggiungerai l’autenticazione reale,
 * potrai trasformare il valore "demo-user" nel vero userId.
 */
userRouter.get("/dashboard", (_req, res) => {
  res.status(200).json({
    userId: "demo-user",
    summary: {
      totalEarnings: 0,
      missionsCompleted: 0,
      activeMissions: 0,
      streakDays: 0,
    },
  });
});

export default userRouter;
