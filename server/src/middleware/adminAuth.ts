import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import db from '../db';

interface UserRow {
  role: string;
  email: string;
  login_method: string;
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const user = db
    .prepare<string[], UserRow>('SELECT role, email, login_method FROM users WHERE id = ?')
    .get(userId);

  if (!user || user.role !== 'admin' || !user.email.endsWith('@extory.co') || user.login_method !== 'google') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  next();
}
