// src/index.ts
import "./instrument"; // inizializza Sentry il prima possibile

import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import * as Sentry from "@sentry/node";
import { db } from "./infra/db";

// Routers
import { missionsRouter } from "./routes/missions.routes";
import { paymentsRouter } from "./routes/payments.routes";
import authRouter from "./routes/auth.routes";

// --------------------- CONFIG ---------------------
const FRONTEND_URL =
  process.env.FRONTEND_URL ??
  "https://agente-4-mission-filter-frontend.vercel.app";

const app = express();

// --------------------- CORS FIX COMPLETO ---------------------
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Gestione richiesta OPTIONS (preflight)
app.options("*", (req, res) => {
  res.header("Access-Control-Allow-Origin", FRONTEND_URL);
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return res.sendStatus(200);
});

// --------------------- MIDDLEWARE BASE ---------------------
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

// --------------------- HEALTH CHECKS ---------------------
const basicHealthHandler = (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
};

app.get("/health", basicHealthHandler);
app.get("/api/health", basicHealthHandler);

app.get("/health/deep", async (_req: Request, res: Response) => {
  try {
    const dbCheck = await db
      .selectFrom("users")
      .select("id")
      .executeTakeFirst();

    const ok = dbCheck !== undefined;

    res.status(ok ? 200 : 503).json({
      status: ok ? "healthy" : "degraded",
      checks: {
        database: ok ? "up" : "down",
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    Sentry.captureException(err);
    res.status(503).json({
      status: "unhealthy",
      error: err?.message ?? "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
});

app.get("/health/live", (_req: Request, res: Response) => {
  res.status(200).json({ status: "alive" });
});

app.get("/health/ready", async (_req: Request, res: Response) => {
  try {
    await db.selectFrom("users").select("id").executeTakeFirst();
    res.status(200).json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "not ready" });
  }
});

// --------------------- API ROUTES ---------------------
app.use("/auth", authRouter);
app.use("/api/missions", missionsRouter);
app.use("/api/payments", paymentsRouter);

// --------------------- GLOBAL ERROR HANDLER ---------------------
app.use(
  (err: any, _req: Request, res: Response, next: NextFunction) => {
    const eventId = Sentry.captureException(err);

    if (res.headersSent) {
      return next(err);
    }

    res.status(500).json({
      error: "Internal server error",
      eventId,
    });
  }
);

// --------------------- 404 FALLBACK ---------------------
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// --------------------- SERVER START ---------------------
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`[BACKEND] Running on port ${port}`);
});

export default app;
