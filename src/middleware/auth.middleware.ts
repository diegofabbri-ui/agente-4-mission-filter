import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-key';

export interface AuthRequest extends Request {
  user?: { userId: string; email: string };
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Token mancante' });

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(403).json({ error: 'Token non valido' });
  }
}

export function generateAccessToken(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}