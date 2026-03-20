import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { OAuth2Client } from 'google-auth-library';
import db from '../db';
import { authService } from '../services/authService';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { config } from '../config';

interface UserRow {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  sync_enabled: number;
  created_at: number;
  google_id: string | null;
  avatar_url: string | null;
}

const googleClient = new OAuth2Client(config.GOOGLE_CLIENT_ID);

const router = Router();

// ─── POST /auth/google ────────────────────────────────────────────────────────
router.post(
  '/google',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { credential } = req.body as { credential?: string };
      if (!credential) {
        res.status(400).json({ error: 'Google credential is required' });
        return;
      }

      if (!config.GOOGLE_CLIENT_ID) {
        res.status(503).json({ error: 'Google login is not configured' });
        return;
      }

      // Verify ID token with Google
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: config.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (!payload?.email) {
        res.status(401).json({ error: 'Invalid Google token' });
        return;
      }

      const { sub: googleId, email, name, picture } = payload;

      // Find existing user by google_id or email
      let user = db
        .prepare<string[], UserRow>('SELECT * FROM users WHERE google_id = ?')
        .get(googleId);

      if (!user) {
        // Try matching by email (existing account → link Google)
        user = db
          .prepare<string[], UserRow>('SELECT * FROM users WHERE email = ?')
          .get(email);

        if (user) {
          // Link Google to existing account
          db.prepare('UPDATE users SET google_id = ?, avatar_url = ? WHERE id = ?').run(
            googleId, picture ?? null, user.id
          );
          user = db.prepare<string[], UserRow>('SELECT * FROM users WHERE id = ?').get(user.id)!;
        } else {
          // New user — create account
          const id = uuidv4();
          const username = (name ?? email.split('@')[0] ?? id).replace(/\s+/g, '').toLowerCase().slice(0, 30);
          // Ensure unique username
          const baseUsername = username;
          let finalUsername = baseUsername;
          let suffix = 1;
          while (db.prepare('SELECT id FROM users WHERE username = ?').get(finalUsername)) {
            finalUsername = `${baseUsername}${suffix++}`;
          }
          db.prepare(
            `INSERT INTO users (id, username, email, password_hash, google_id, avatar_url, created_at)
             VALUES (?, ?, ?, '', ?, ?, ?)`
          ).run(id, finalUsername, email, googleId, picture ?? null, Date.now());
          user = db.prepare<string[], UserRow>('SELECT * FROM users WHERE id = ?').get(id)!;
        }
      }

      const accessToken = authService.generateAccessToken(user.id);
      const refreshToken = authService.generateRefreshToken(user.id);

      res
        .cookie('refresh_token', refreshToken, cookieOptions())
        .json({
          accessToken,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            avatarUrl: user.avatar_url,
            syncEnabled: user.sync_enabled === 1,
          },
        });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /auth/register ──────────────────────────────────────────────────────
router.post(
  '/register',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { username, email, password } = req.body as {
        username?: string;
        email?: string;
        password?: string;
      };

      if (!username || !email || !password) {
        res
          .status(400)
          .json({ error: 'username, email and password are required' });
        return;
      }

      if (password.length < 8) {
        res
          .status(400)
          .json({ error: 'Password must be at least 8 characters' });
        return;
      }

      const existing = db
        .prepare<string[], UserRow>(
          'SELECT id FROM users WHERE email = ? OR username = ?'
        )
        .get(email, username);

      if (existing) {
        res
          .status(409)
          .json({ error: 'Email or username already in use' });
        return;
      }

      const id = uuidv4();
      const passwordHash = authService.hashPassword(password);
      const now = Date.now();

      db.prepare(
        `INSERT INTO users (id, username, email, password_hash, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(id, username, email, passwordHash, now);

      const accessToken = authService.generateAccessToken(id);
      const refreshToken = authService.generateRefreshToken(id);

      res
        .cookie('refresh_token', refreshToken, cookieOptions())
        .status(201)
        .json({
          accessToken,
          user: { id, username, email, syncEnabled: true },
        });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /auth/login ─────────────────────────────────────────────────────────
router.post(
  '/login',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body as {
        email?: string;
        password?: string;
      };

      if (!email || !password) {
        res.status(400).json({ error: 'email and password are required' });
        return;
      }

      const user = db
        .prepare<string[], UserRow>(
          'SELECT * FROM users WHERE email = ?'
        )
        .get(email);

      if (
        !user ||
        !authService.verifyPassword(password, user.password_hash)
      ) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const accessToken = authService.generateAccessToken(user.id);
      const refreshToken = authService.generateRefreshToken(user.id);

      res
        .cookie('refresh_token', refreshToken, cookieOptions())
        .json({
          accessToken,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            syncEnabled: user.sync_enabled === 1,
          },
        });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /auth/refresh ───────────────────────────────────────────────────────
router.post(
  '/refresh',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawToken = req.cookies?.['refresh_token'] as string | undefined;
      if (!rawToken) {
        res.status(401).json({ error: 'No refresh token' });
        return;
      }

      const result = authService.verifyAndRotateRefreshToken(rawToken);
      if (!result) {
        res.status(401).json({ error: 'Invalid or expired refresh token' });
        return;
      }

      const accessToken = authService.generateAccessToken(result.userId);

      res
        .cookie('refresh_token', result.newRefreshToken, cookieOptions())
        .json({ accessToken });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /auth/logout ────────────────────────────────────────────────────────
router.post(
  '/logout',
  requireAuth,
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawToken = req.cookies?.['refresh_token'] as string | undefined;
      if (rawToken) {
        authService.revokeRefreshToken(rawToken);
      }
      res.clearCookie('refresh_token').json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /auth/me ─────────────────────────────────────────────────────────────
router.get('/me', requireAuth, (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const user = db
    .prepare<string[], UserRow>('SELECT * FROM users WHERE id = ?')
    .get(userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    syncEnabled: user.sync_enabled === 1,
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'strict' as const,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
  };
}

export default router;
