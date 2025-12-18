import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { missionsRouter } from './routes/missions.routes';
import { authRouter } from './routes/auth.routes';
import { userRouter } from './routes/user.routes';
import { initScheduler } from './cron/scheduler';

// 1. Configurazione Ambiente
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// 2. Middleware
app.use(cors());
app.use(express.json());

/**
 * 🛠 Health Check per Aruba/Railway
 * Deve rispondere immediatamente per evitare il SIGTERM
 */
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'online',
    message: 'Agente 4 Mission Filter API è attivo 🚀',
    timestamp: new Date().toISOString()
  });
});

// 3. Rotte API
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/missions', missionsRouter);

/**
 * 🚨 Gestore Errori Globale
 */
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('❌ [SERVER ERROR]:', err);
  res.status(err.status || 500).json({
    error: err.name || 'Internal Server Error',
    message: err.message || 'Errore imprevisto del server'
  });
});

/**
 * 🚀 Avvio Server (UNICA DICHIARAZIONE)
 */
const server = app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`\n*****************************************`);
  console.log(`🚀 Agente 4 in ascolto su Aruba/Railway`);
  console.log(`📡 Endpoint: http://0.0.0.0:${PORT}`);
  console.log(`*****************************************\n`);

  // Inizializza lo scheduler dopo l'avvio del server
  try {
    initScheduler();
    console.log('⏰ Scheduler Multi-Tenant inizializzato');
  } catch (error) {
    console.error('⚠️ Errore scheduler:', error);
  }
});

/**
 * 🛑 Gestione Chiusura Pulita
 */
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM ricevuto: chiusura in corso...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});