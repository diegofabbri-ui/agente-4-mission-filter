import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { missionsRouter } from './routes/missions.routes';
import { authRouter } from './routes/auth.routes';
import { userRouter } from './routes/user.routes';
import { initScheduler } from './cron/scheduler';

/**
 * ⚙️ CONFIGURAZIONE AMBIENTE
 */
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware di base
app.use(cors());
app.use(express.json());

/**
 * 🏥 HEALTH CHECK (CRITICO PER RAILWAY/ARUBA)
 * Questa rotta deve rispondere immediatamente 200 OK.
 * Impedisce all'host di terminare il container (SIGTERM) durante l'avvio.
 */
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'online',
    service: 'Agente 4 Mission Filter - Sniper Engine',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * 🛣️ CONFIGURAZIONE ROTTE API
 */
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/missions', missionsRouter);

/**
 * 🚨 GLOBAL ERROR HANDLER
 * Cattura eventuali errori non gestiti evitando il crash del processo.
 */
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('❌ [CRITICAL ERROR]:', err);
  res.status(err.status || 500).json({
    error: err.name || 'InternalServerError',
    message: err.message || 'Si è verificato un errore imprevisto nel server.'
  });
});

/**
 * 🚀 AVVIO SERVER (UNICA DICHIARAZIONE)
 * Nota: Ascoltiamo su 0.0.0.0 per garantire la visibilità esterna su cloud.
 */
const server = app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`\n*****************************************`);
  console.log(`🚀 AGENTE 4: SISTEMA OPERATIVO`);
  console.log(`📡 URL: http://0.0.0.0:${PORT}`);
  console.log(`*****************************************\n`);

  // Inizializza lo scheduler dopo che il server è pronto
  try {
    initScheduler();
    console.log('⏰ Scheduler Multi-Tenant caricato (Fuso Orario: Rome)');
  } catch (error) {
    console.error('⚠️ Errore durante l\'avvio dello scheduler:', error);
  }
});

/**
 * 🛑 GESTIONE SEGNALI DI CHIUSURA (GRACEFUL SHUTDOWN)
 */
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM ricevuto: arresto del server in corso...');
  server.close(() => {
    console.log('💤 Processo terminato correttamente.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});