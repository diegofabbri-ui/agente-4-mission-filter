import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import morgan from "morgan";
import * as Sentry from "@sentry/node";
import dotenv from "dotenv";

// Carica variabili d'ambiente
dotenv.config();

// Import Infrastruttura Database
import { db } from "./infra/db";

// Import Scheduler (Il Cacciatore Automatico)
import { initScheduler } from "./cron/scheduler";

// Import Rotte
import { missionsRouter } from "./routes/missions.routes";
import { authRouter } from "./routes/auth.routes";
import userRouter from "./routes/user.routes";

// --------------------------------------------------
// 1. BOOTSTRAP
// --------------------------------------------------
console.log("BOOT: System starting...");

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  });
  console.log("BOOT: Sentry initialized");
}

const app = express();

// --------------------------------------------------
// 2. CONFIGURAZIONE & MIDDLEWARE
// --------------------------------------------------

// Dependency Injection: Rendiamo il DB accessibile in tutte le rotte
app.set("db", db);

app.use(
  cors({
    origin: "*", // Nota: In produzione, restringi ai domini del tuo frontend
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
app.use(morgan("dev")); // Logging delle richieste HTTP

// --------------------------------------------------
// 3. HEALTHCHECK (Per Railway)
// --------------------------------------------------
const basicHealthHandler = (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    service: "Agente 4 Backend Core",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
};

app.get("/", basicHealthHandler);
app.get("/api/health", basicHealthHandler);

// --------------------------------------------------
// 4. ROTTE API
// --------------------------------------------------
console.log("BOOT: Mounting routes...");

// Autenticazione e Profilo
app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);

// Core Business: Missioni (Ricerca, Sviluppo, Esecuzione)
app.use("/api/missions", missionsRouter);

// --------------------------------------------------
// 5. GESTIONE ERRORI GLOBALE
// --------------------------------------------------
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("UNHANDLED ERROR:", err);
  const eventId = Sentry.captureException(err);

  if (!res.headersSent) {
    res.status(500).json({
      error: "server_error",
      message: "Errore interno del server.",
      eventId,
    });
  }
});

// 404 Handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "not_found", message: "Endpoint non trovato" });
});

// --------------------------------------------------
// 6. AVVIO SERVER
// --------------------------------------------------
const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`🚀 Backend listening on port ${port}`);

  // Avvio del "Cacciatore" (Cron Job per la ricerca automatica)
  console.log("⏰ Starting The Hunter scheduler...");
  initScheduler();
  
  console.log("✅ BOOT COMPLETE: System ready.");
});

export default app;