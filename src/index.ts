// src/index.ts
import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import morgan from "morgan";
import cors from "cors";

import { missionsRouter } from "./routes/missions.routes";
import userRouter from "./routes/user.routes";

import { db } from "./infra/db";
import { openai } from "./infra/openai";

import { MissionFilterService } from "./services/mission-filter.service";
import { UserAIProfileService } from "./services/ai-profile.service";

const app = express();
const PORT = process.env.PORT || 3000;

// ----------------------------
// 1) CORS CONFIG (necessario per Vercel)
// ----------------------------
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://agente-4-mission-filter-frontend.vercel.app",
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

// ----------------------------
// 2) MIDDLEWARE GLOBALI
// ----------------------------
app.use(express.json());
app.use(morgan("dev"));

// ----------------------------
// 3) SERVIZI CORE (MissionFilter + Profili AI)
// ----------------------------
const missionFilterService = new MissionFilterService({
  db,
  openai,
  logger: console,
});

const aiProfileService = new UserAIProfileService(db);

// Disponibili ovunque
app.set("db", db);
app.set("missionFilterService", missionFilterService);
app.set("aiProfileService", aiProfileService);

// ----------------------------
// 4) HEALTHCHECK (public + internal)
// ----------------------------
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    env: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// Per Railway
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// ----------------------------
// 5) API ROUTES
// ----------------------------

// Tutte le missioni / AI / invii automatici
app.use("/api", missionsRouter);

// NUOVA ROUTE DASHBOARD
app.use("/api/user", userRouter);

// ----------------------------
// 6) 404 HANDLER
// ----------------------------
app.use((req: Request, res: Response) => {
  return res.status(404).json({
    error: "Endpoint non trovato",
    path: req.originalUrl,
  });
});

// ----------------------------
// 7) GLOBAL ERROR HANDLER
// ----------------------------
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Errore non gestito:", err);

  const status = err.statusCode || err.status || 500;
  const message =
    err.message || "Errore interno del server. Riprova più tardi.";

  return res.status(status).json({
    error: message,
  });
});

// ----------------------------
// 8) AVVIO SERVER
// ----------------------------
app.listen(PORT, () => {
  console.log(`🚀 Server avviato su http://localhost:${PORT}`);
});
