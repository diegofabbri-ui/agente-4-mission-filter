import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { missionsRouter } from './routes/missions.routes';
import { authRouter } from './routes/auth.routes';
import { userRouter } from './routes/user.routes';
import { initScheduler } from './cron/scheduler';

// 1. Caricamento ambiente
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

/**
 * ⚡ HEALTH CHECK PRIORITARIO
 * Definita prima di ogni middleware per rispondere in microsecondi.
 * Railway usa questa rotta per decidere se il server è "vivo".
 */
app.get('/', (req: Request, res: Response) => {
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
 * 🚨 GESTORE ERRORI
 */
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('❌ [SERVER ERROR]:', err);
  if (!res.headersSent) {
    res.status(err.status || 500).json({ error: err.message || 'Errore interno' });
  }
});

/**
 * 🚀 AVVIO SERVER
 * Binding su 0.0.0.0 obbligatorio per l'hosting cloud.
 */
const server = app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`\n*****************************************`);
  console.log(`🚀 AGENTE 4: OPERATIVO SULLA PORTA ${PORT}`);
  console.log(`*****************************************\n`);

  /**
   * ⏰ SCHEDULER RITARDATO
   * Avviamo lo scheduler con un leggero ritardo (5 secondi) per lasciare 
   * che Railway stabilizzi la connessione al container prima di caricare task pesanti.
   */
  setTimeout(() => {
    try {
      initScheduler();
      console.log('⏰ Scheduler inizializzato con successo.');
    } catch (error) {
      console.error('⚠️ Errore avvio scheduler:', error);
    }
  }, 5000);
});

/**
 * 🛑 GRACEFUL SHUTDOWN
 */
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM ricevuto: chiusura sicura...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});