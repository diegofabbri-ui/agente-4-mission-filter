import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { missionsRouter } from './routes/missions.routes';
import { authRouter } from './routes/auth.routes';
import { userRouter } from './routes/user.routes';
import { initScheduler } from './cron/scheduler';

// 1. Inizializzazione Ambiente
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

/**
 * ⚡ HEALTH CHECK PRIORITARIO (L'ULTIMO BALUARDO)
 * Railway monitora questa rotta per decidere se uccidere il container (SIGTERM).
 * Deve stare SOPRA a tutto, perfino sopra a cors() e express.json().
 */
app.get('/', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send('OK');
});

// 2. Middleware di base
app.use(cors());
app.use(express.json());

/**
 * 🛣️ ROTTE API
 */
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/missions', missionsRouter);

/**
 * 🚨 GLOBAL ERROR HANDLER
 */
app.use((err: any, _req: Request, res: Response, _next: any) => {
  console.error('❌ [SERVER ERROR]:', err.message);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

/**
 * 🚀 AVVIO SERVER
 */
const server = app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`\n*****************************************`);
  console.log(`🚀 AGENTE 4: SISTEMA OPERATIVO ATTIVO`);
  console.log(`📡 PORTA: ${PORT} | AMBIENTE: ${process.env.NODE_ENV}`);
  console.log(`*****************************************\n`);

  /**
   * ⏰ SCHEDULER & AI BOOT (DELAYED)
   * Carichiamo lo scheduler con un ritardo di 20 secondi.
   * Questo garantisce che Railway abbia già completato 2-3 cicli di 
   * Health Check positivi prima di impegnare la CPU con l'AI.
   */
  setTimeout(() => {
    try {
      initScheduler();
      console.log('⏰ [SYSTEM] Scheduler attivato correttamente dopo il boot.');
    } catch (error) {
      console.error('⚠️ [SYSTEM] Errore inizializzazione Scheduler:', error);
    }
  }, 20000); 
});

/**
 * 🛑 GESTIONE SEGNALI DI SISTEMA
 */
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM: Chiusura ordinata del server...');
  server.close(() => {
    console.log('💤 Processo terminato.');
    process.exit(0);
  });
});