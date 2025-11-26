// src/middleware/auth.middleware.ts
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export interface JwtPayload {
  userId: string;
  email: string;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

/**
 * Middleware di autenticazione JWT.
 * - Legge il token da Authorization: Bearer <token>
 * - Verifica il token
 * - Aggiunge req.user con { userId, email }
 */
export function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers['authorization'];

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token mancante o non valido' });
  }

  const token = header.substring('Bearer '.length);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token non valido o scaduto' });
  }
}

/**
 * Utility per generare un JWT a partire da userId + email
 */
export function generateAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '7d',
  });
}
