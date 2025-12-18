import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { missionsRouter } from './routes/missions.routes';
import { authRouter } from './routes/auth.routes';
import { userRouter } from './routes/user.routes';
import { initScheduler } from './cron/scheduler'; // Import corretto per risolvere l'errore TS2305

// Carica variabili d'ambiente
dotenv.config();

const app = express();

// Porta dinamica fornita dall'host o default a 8080
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());

/**
 * 🛠 ROTTA DI HEALTH CHECK (FONDAMENTALE per Aruba e Railway)
 * Evita il crash del container rispondendo immediatamente al ping dell'host.
 */
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'online',
    message: 'Agente 4 Mission Filter API è attivo 🚀',
    timestamp: new Date().toISOString()
  });
});

/**
 * 🛣 CONFIGURAZIONE ROTTE API
 */
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/missions', missionsRouter);

/**
 * 🚨 GESTORE ERRORI GLOBALE
 * Impedisce al server di crashare in caso di eccezioni non gestite.
 */
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('❌ [SERVER ERROR]:', err);
  res.status(err.status || 500).json({
    error: err.name || 'Internal Server Error',
    message: err.message || 'Errore imprevisto del server'
  });
});

/**
 * 🚀 AVVIO SERVER
 */
const server = app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`\n*****************************************`);
  console.log(`🚀 Agente 4 in ascolto su Aruba/Railway`);
  console.log(`📡 Endpoint: http://0.0.0.0:${PORT}`);
  console.log(`*****************************************\n`);

  // Inizializza lo scheduler dopo l'avvio del server
  try {
    initScheduler();
    console.log('⏰ Scheduler Multi-Tenant inizializzato con successo');
  } catch (error) {
    console.error('⚠️ Errore durante l\'avvio dello scheduler:', error);
  }
});

/**
 * 🛑 GESTIONE CHIUSURA PULITA
 */
process.on('SIGTERM', () => {
  console.log('👋 Ricevuto SIGTERM: chiusura del server in corso...');
  server.close(() => {
    console.log('💤 Server arrestato.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('👋 Ricevuto SIGINT: arresto immediato...');
  server.close(() => process.exit(0));
});

app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/missions', missionsRouter);

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('❌ [SERVER ERROR]:', err);
  res.status(err.status || 500).json({
    error: err.name || 'Internal Server Error',
    message: err.message || 'Errore imprevisto'
  });
});

const server = app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`\n🚀 Server pronto su http://0.0.0.0:${PORT}`);
  
  // Avvio dello scheduler
  initScheduler();
  console.log('⏰ Scheduler inizializzato correttamente');
});

process.on('SIGTERM', () => {
  console.log('👋 Ricevuto SIGTERM: chiusura pulita...');
  server.close(() => process.exit(0));
});