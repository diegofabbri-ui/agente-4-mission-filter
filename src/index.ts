import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import './infra/db';
import { authRouter } from './routes/auth.routes';
import { missionsRouter } from './routes/missions.routes';
import { userRouter } from './routes/user.routes';
import { authMiddleware } from './middleware/auth.middleware';
import { startScheduler } from './cron/scheduler'; // Import corretto

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => { console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`); next(); });

app.use('/api/auth', authRouter);
app.use('/api/missions', authMiddleware, missionsRouter);
app.use('/api/user', authMiddleware, userRouter);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(port, () => {
  console.log(`🚀 Backend listening on port ${port}`);
  startScheduler();
});