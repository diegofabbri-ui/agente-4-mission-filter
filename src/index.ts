// -------------------------------------------------------------
// SENTRY INIT (DEVE ESSERE IL PRIMO IMPORT SEMPRE)
// -------------------------------------------------------------
import "./instrument";

import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import morgan from "morgan";
import * as Sentry from "@sentry/node";
import { db } from "./infra/db";

// Routers
import { missionsRouter } from "./routes/missions.routes";
import { paymentsRouter } from "./routes/payments.routes";

// -------------------------------------------------------------
// EXPRESS APP
// -------------------------------------------------------------
const app = express();

// -------------------------------------------------------------
// CORS — WHITELIST DEFINITIVA PER VERCE + LOCALHOST
// -------------------------------------------------------------
const whitelist = [
  "http://localhost:5173",
  "https://agente-4-mission-filter.vercel.app",
  "https://agente-4-mission-filter-frontend.vercel.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // Postman/cURL

      if (whitelist.includes(origin)) {
        return callback(null, true);
      } else {
        console.log("❌ CORS BLOCKED:", origin);
        return callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Preflight universale
app.options("*", (req, res) => {
  const origin = req.headers.origin;

  if (origin && whitelist.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }

  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return res.sendStatus(200);
});

// -------------------------------------------------------------
// MIDDLEWARE BASE
// -------------------------------------------------------------
app.use(express.json());
app.use(morgan("dev"));

// -------------------------------------------------------------
// HEALTH CHECKS
// -------------------------------------------------------------

const basicHealthHandler = (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
};

app.get("/health", basicHealthHandler);
app.get("/api/health", basicHealthHandler);

// DB check
app.get("/health/deep", async (_req: Request, res: Response) => {
  try {
    const dbCheck = await db.selectFrom("users").select("id").executeTakeFirst();
    const healthy = dbCheck !== undefined;

    res.status(healthy ? 200 : 503).json({
      status: healthy ? "healthy" : "degraded",
      checks: {
        database: healthy ? "up" : "down",
      },
    });
  } catch (err: any) {
    Sentry.captureException(err);
    res.status(503).json({
      status: "unhealthy",
      error: err?.message ?? "Unknown error",
    });
  }
});

// Liveness
app.get("/health/live", (_req, res) => {
  res.status(200).json({ status: "alive" });
});

// Readiness
app.get("/health/ready", async (_req, res) => {
  try {
    await db.selectFrom("users").select("id").executeTakeFirst();
    res.status(200).json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "not ready" });
  }
});

// -------------------------------------------------------------
// API ROUTES
// -------------------------------------------------------------
app.use("/api/missions", missionsRouter);
app.use("/api/payments", paymentsRouter);

// -------------------------------------------------------------
// GLOBAL ERROR HANDLER
// -------------------------------------------------------------
app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  const eventId = Sentry.captureException(err);

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    error: "Internal server error",
    eventId,
  });
});

// -------------------------------------------------------------
// 404 FALLBACK
// -------------------------------------------------------------
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// -------------------------------------------------------------
// START SERVER
// -------------------------------------------------------------
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});

export default app;
