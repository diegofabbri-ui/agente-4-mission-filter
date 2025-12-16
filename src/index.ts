import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import './infra/db';
import { authRouter } from './routes/auth.routes';
import { missionsRouter } from './routes/missions.routes';
import { userRouter } from './routes/user.routes';
import { authMiddleware } from './middleware/auth.middleware';
import { startScheduler } from './cron/scheduler';

dotenv.config();

const app = express();
// Railway fornisce la porta tramite env, altrimenti 8080
const port = parseInt(process.env.PORT || '8080', 10);

app.use(cors());
app.use(express.json());

// Log delle richieste (utile per debug)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// --- FIX RAILWAY: Rotta Base per Health Check ---
// Railway pinga qui per sapere se l'app è viva. Se non rispondi 200, ti uccide.
app.get('/', (req, res) => {
  res.status(200).send('Agente 4 Backend Operativo 🚀');
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// Rotte API
app.use('/api/auth', authRouter);
app.use('/api/missions', authMiddleware, missionsRouter);
app.use('/api/user', authMiddleware, userRouter);

// Avvio Server con binding esplicito
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Backend listening on port ${port} (0.0.0.0)`);
  // Avvia lo scheduler solo dopo che il server è su
  startScheduler();
});