// src/index.ts
import './instrument'; // inizializza Sentry il prima possibile

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import * as Sentry from '@sentry/node';
import { db } from './infra/db';

// Router esportati per nome
import { missionsRouter } from './routes/missions.routes';
import { paymentsRouter } from './routes/payments.routes';

const app = express();

// --------------------- MIDDLEWARE BASE ------------------
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// --------------------- HEALTH CHECKS --------------------

// Handler riutilizzabile per /health e /api/health
const basicHealthHandler = (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
};

app.get('/health', basicHealthHandler);
app.get('/api/health', basicHealthHandler);

// Health "deep" con check DB
app.get('/health/deep', async (_req: Request, res: Response) => {
  try {
    const dbCheck = await db
      .selectFrom('users')
      .select('id')
      .executeTakeFirst();

    const allGood = dbCheck !== undefined;

    res.status(allGood ? 200 : 503).json({
      status: allGood ? 'healthy' : 'degraded',
      checks: {
        database: allGood ? 'up' : 'down',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    Sentry.captureException(error);
    res.status(503).json({
      status: 'unhealthy',
      error: error?.message ?? 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

// Liveness probe
app.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'alive' });
});

// Readiness probe
app.get('/health/ready', async (_req: Request, res: Response) => {
  try {
    await db.selectFrom('users').select('id').executeTakeFirst();
    res.status(200).json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not ready' });
  }
});

// --------------------- API ROUTES -----------------------
// Qui puoi avere il tuo middleware di auth, se esiste
// es: app.use(authMiddleware);

app.use('/api/missions', missionsRouter);
app.use('/api/payments', paymentsRouter);

// --------------------- ERROR HANDLER GLOBALE -----------
// Centralizza gli errori reali e li manda a Sentry
app.use(
  (err: any, _req: Request, res: Response, next: NextFunction) => {
    const eventId = Sentry.captureException(err);

    if (res.headersSent) {
      return next(err);
    }

    res.status(500).json({
      error: 'Internal server error',
      eventId,
    });
  },
);

// --------------------- 404 FINALE ----------------------
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// --------------------- SERVER START ---------------------
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});

export default app;
