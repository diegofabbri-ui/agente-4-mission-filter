import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { missionsRouter } from './routes/missions.routes';
import { authRouter } from './routes/auth.routes';
import { userRouter } from './routes/user.routes';
import { initScheduler } from './cron/scheduler';

// Caricamento variabili d'ambiente
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

/**
 * ⚡ PROVA DI VITA (Health Check) - PRIORITÀ MASSIMA
 * Questa rotta è posizionata PRIMA di ogni middleware.
 * Serve a Railway per confermare che il container è attivo.
 */
app.get('/', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send('OK');
});

// Middleware standard
app.use(cors());
app.use(express.json());

/**
 * 🛣️ ROTTE API
 */
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/missions', missionsRouter);

/**
 * 🚨 GESTIONE ERRORI GLOBALE
 */
app.use((err: any, _req: Request, res: Response, _next: any) => {
  console.error('❌ [CRITICAL]:', err.message);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * 🚀 AVVIO SERVER
 */
const server = app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`\n*****************************************`);
  console.log(`🚀 AGENTE 4: SISTEMA ATTIVO`);
  console.log(`📡 PORTA: ${PORT} | MODE: ${process.env.NODE_ENV}`);
  console.log(`*****************************************\n`);

  /**
   * ⏰ AVVIO SCHEDULER POST-BOOT
   * Lo inizializziamo con un ritardo di 10 secondi.
   * Questo garantisce che il server abbia già risposto ai primi "ping" 
   * di Railway prima di iniziare a caricare i task cron.
   */
  setTimeout(() => {
    try {
      initScheduler();
      console.log('⏰ [SYSTEM] Scheduler attivato correttamente.');
    } catch (error) {
      console.error('⚠️ [SYSTEM] Errore inizializzazione Scheduler:', error);
    }
  }, 10000);
});

/**
 * 🛑 GESTIONE SEGNALI (SIGTERM/SIGINT)
 */
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM ricevuto. Chiusura sicura del server...');
  server.close(() => {
    console.log('💤 Processo terminato.');
    process.exit(0);
  });
});