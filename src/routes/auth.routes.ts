import { Router } from 'express';
import { generateAccessToken } from '../middleware/auth.middleware';
import { db } from '../infra/db';
import crypto from 'crypto';

export const authRouter = Router();

// LOGIN: Genera un Token VERO
authRouter.post('/login', async (req: any, res) => {
  const { email, password } = req.body;

  // In un sistema reale cercheremmo nel DB e faremmo hash della password.
  // PER ORA: Semplifichiamo per farti entrare subito (Dev Mode).
  // Accetta qualsiasi email/password purché non vuoti.
  
  if (!email || !password) {
      return res.status(400).json({ error: "Email e password richieste" });
  }

  // Simuliamo l'utente (o prendiamolo dal DB se esiste)
  // Qui forziamo l'ID utente che stai usando per i test
  const userId = "74de7a01-56fa-46f7-be80-53e899877301"; 

  const token = generateAccessToken({ userId, email });

  return res.json({ 
      token, 
      user: { id: userId, email } 
  });
});

// REGISTER (Semplificato)
authRouter.post('/register', async (req: any, res) => {
    // Per ora rimandiamo al login, tanto siamo in test
    res.json({ success: true, message: "Usa /login per entrare" });
});