import { Router } from 'express';

export const authRouter = Router();

// Endpoint mock per login/register (sostituire con logica reale se necessario)
authRouter.post('/login', (req, res) => {
  res.json({ token: "mock-token-123", user: { id: "1", email: "test@user.com" } });
});

authRouter.post('/register', (req, res) => {
  res.json({ success: true, user: { id: "1", email: "test@user.com" } });
});