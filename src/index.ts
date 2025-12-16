import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import './infra/db'; // Inizializza la connessione al DB
import { authRouter } from './routes/auth.routes';
import { missionsRouter } from './routes/missions.routes';
import { userRouter } from './routes/user.routes'; // Import corretto con parentesi graffe
import { authMiddleware } from './middleware/auth.middleware';
import { startScheduler } from './cron/scheduler';

dotenv.config();

// Verifica preliminare delle chiavi API critiche
if (!process.env.OPENAI_API_KEY || !process.env.PERPLEXITY_API_KEY || !process.env.GEMINI_API_KEY) {
  console.warn("⚠️ ATTENZIONE: Alcune API KEYS mancano nel .env (OPENAI, PERPLEXITY o GEMINI). Il sistema potrebbe non funzionare correttamente.");
}

const app = express();
const port = process.env.PORT || 8080;

// Configurazione Middleware
app.use(cors()); // Abilita CORS per il frontend
app.use(express.json()); // Parsing del body JSON delle richieste

// Middleware di logging per debug
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

console.log("BOOT: Mounting routes...");

// --- DEFINIZIONE ROTTE ---

// Autenticazione (Login/Register) - Pubbliche
app.use('/api/auth', authRouter);

// Missioni (Caccia, Sviluppo, Esecuzione) - Protette
app.use('/api/missions', authMiddleware, missionsRouter);

// Utente (Profilo, Manifesto, Settings) - Protette
app.use('/api/user', authMiddleware, userRouter);

// Health Check (per Railway/Monitoraggio)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Gestione Errori Globale
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("🔥 Errore non gestito:", err);
  res.status(500).json({ error: "Errore interno del server" });
});

// --- AVVIO SERVER ---
app.listen(port, () => {
  console.log(`🚀 Backend listening on port ${port}`);
  
  // Avvio Cron Job per la caccia automatica
  try {
    startScheduler();
    console.log("⏰ Scheduler 'The Hunter' avviato.");
  } catch (e) {
    console.error("❌ Errore nell'avvio dello Scheduler:", e);
  }
});