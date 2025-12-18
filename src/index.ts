import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { missionsRouter } from './routes/missions.routes';
import { authRouter } from './routes/auth.routes';
import { userRouter } from './routes/user.routes';
import { initScheduler } from './cron/scheduler';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

/**
 * ⚡ HEALTH CHECK PRIORITARIO (L'unico che conta per Railway)
 * Deve stare SOPRA a tutto, anche a cors e json.
 */
app.get('/', (_req: Request, res: Response) => {
  res.status(200).send('OK');
});

// Middleware standard
app.use(cors());
app.use(express.json());

// Rotte API
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/missions', missionsRouter);

const server = app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🚀 AGENTE 4: SISTEMA ATTIVO SULLA PORTA ${PORT}`);

  // Ritardiamo lo scheduler di 15 secondi per dare priorità assoluta al boot
  setTimeout(() => {
    try {
      initScheduler();
      console.log('⏰ [SYSTEM] Scheduler pronto.');
    } catch (e) {
      console.error('⚠️ [SYSTEM] Errore scheduler:', e);
    }
  }, 15000);
});

// Gestione spegnimento
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});