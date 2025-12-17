import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { missionsRouter } from './routes/missions.routes';
import { authRouter } from './routes/auth.routes';
import { userRouter } from './routes/user.routes';
import { initScheduler } from './cron/scheduler';

// Carica variabili d'ambiente
dotenv.config();

const app = express();

// Porta dinamica (fondamentale per Aruba/Railway)
const PORT = process.env.PORT || 8080;

// Middleware di base
app.use(cors());
app.use(express.json());

/**
 * 🛠 ROTTA DI HEALTH CHECK (FONDAMENTALE)
 * Aruba e Railway inviano un "ping" qui per sapere se il server è vivo.
 * Deve rispondere 200 OK immediatamente.
 */
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'online',
    message: 'Agente 4 Mission Filter API è attivo e funzionante 🚀',
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
 * Impedisce al server di chiudersi bruscamente in caso di eccezioni non gestite.
 */
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('❌ [SERVER ERROR]:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message || 'Errore imprevisto del server'
  });
});

/**
 * 🚀 AVVIO SERVER
 */
const startServer = () => {
  try {
    // Ascoltiamo su 0.0.0.0 per garantire l'accessibilità dall'esterno dell'host
    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`\n*****************************************`);
      console.log(`🚀 Agente 4 pronto sull'host Aruba`);
      console.log(`📡 URL: http://0.0.0.0:${PORT}`);
      console.log(`*****************************************\n`);

      // Inizializza lo scheduler solo dopo che il server è su
      initScheduler();
      console.log('⏰ Scheduler Multi-Tenant inizializzato (Rome Time)');
    });
  } catch (error) {
    console.error('🔥 Impossibile avviare il server:', error);
    process.exit(1);
  }
};

startServer();

// Gestione segnali di chiusura pulita (SIGTERM/SIGINT)
process.on('SIGTERM', () => {
  console.log('👋 Ricevuto SIGTERM: chiusura del server in corso...');
  process.exit(0);
});