// src/index.ts 
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import morgan from 'morgan';
import { missionsRouter } from './routes/missions.routes';
import { db } from './infra/db';
import { openai } from './infra/openai';
import { MissionFilterService } from './services/mission-filter.service';
import { UserAIProfileService } from './services/ai-profile.service';

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- SERVIZI CORE ----------

const missionFilterService = new MissionFilterService({
  db,
  openai,
  logger: console,
});

const aiProfileService = new UserAIProfileService(db);

// Mettiamo tutto in app.locals per usarlo nei router
app.set('db', db);
app.set('missionFilterService', missionFilterService);
app.set('aiProfileService', aiProfileService);

// ---------- MIDDLEWARE GLOBALI ----------

app.use(express.json());
app.use(morgan('dev'));

// ---------- HEALTHCHECK PUBBLICO (USATO DA RAILWAY) ----------
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    env: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ---------- HEALTHCHECK INTERNO ----------
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------- API ROUTES ----------
app.use('/api', missionsRouter);

// 404 handler
app.use((req: Request, res: Response) => {
  return res.status(404).json({
    error: 'Endpoint non trovato',
    path: req.originalUrl,
  });
});

// Error handler globale
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Errore non gestito:', err);

  const status = err.statusCode || err.status || 500;
  const message =
    err.message || 'Errore interno del server. Riprova più tardi.';

  return res.status(status).json({
    error: message,
  });
});

// Avvio server
app.listen(PORT, () => {
  console.log(`🚀 Server avviato su http://localhost:${PORT}`);
});
