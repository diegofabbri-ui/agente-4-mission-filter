// src/index.ts
import "dotenv/config";
import express from "express";
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

// ---------------------
// SERVIZI CORE
// ---------------------
const missionFilterService = new MissionFilterService({
  db,
  openai,
  logger: console,
});

const aiProfileService = new UserAIProfileService(db);

app.set("db", db);
app.set("missionFilterService", missionFilterService);
app.set("aiProfileService", aiProfileService);

// ---------------------
// MIDDLEWARE GLOBALI
// ---------------------
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// ---------------------
// HEALTHCHECK
// ---------------------
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", env: process.env.NODE_ENV });
});

// ---------------------
// ROUTES (ORDINE IMPORTANTE!)
// ---------------------

// 🚀 MISSIONI → potrebbero usare auth dentro missionsRouter
app.use("/api", missionsRouter);

// 🚀 DASHBOARD → SEMPRE PUBBLICA → niente authMiddleware
app.use("/api/user", userRouter);

// ---------------------
// 404
// ---------------------
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint non trovato",
    path: req.originalUrl,
  });
});

// ---------------------
// ERROR HANDLER
// ---------------------
app.use((err, _req, res, _next) => {
  console.error("Errore non gestito:", err);

  const status = err.statusCode || 500;
  const message = err.message || "Errore interno del server";

  res.status(status).json({ error: message });
});

// ---------------------
// SERVER
// ---------------------
app.listen(PORT, () => {
  console.log(`🚀 Server attivo su http://localhost:${PORT}`);
});
