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

// ─── GET /auth/google-client-id ───────────────────────────────────────────────
router.get('/google-client-id', (_req: Request, res: Response) => {
  res.json({ googleClientId: config.GOOGLE_CLIENT_ID || null });
});

// ─── POST /auth/google ────────────────────────────────────────────────────────
// 두 가지 방식 지원:
//   1. { credential } — 웹 GSI ID Token (기존)
//   2. { code, redirectUri } — Electron Authorization Code Flow (신규)
router.post(
  '/google',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!config.GOOGLE_CLIENT_ID) {
        res.status(503).json({ error: 'Google login is not configured' });
        return;
      }

      const body = req.body as { credential?: string; code?: string; redirectUri?: string };
      let googleId: string;
      let email: string;
      let name: string | undefined;
      let picture: string | undefined;

      if (body.credential) {
        // 웹 방식: ID Token 검증
        const ticket = await googleClient.verifyIdToken({
          idToken: body.credential,
          audience: config.GOOGLE_CLIENT_ID,
        });
        const p = ticket.getPayload();
        if (!p?.email || !p?.sub) {
          res.status(401).json({ error: 'Invalid Google token' });
          return;
        }
        googleId = p.sub; email = p.email; name = p.name ?? undefined; picture = p.picture ?? undefined;
      } else if (body.code && body.redirectUri) {
        // Electron 방식: Authorization Code → ID Token 교환
        const codeClient = new OAuth2Client(config.GOOGLE_CLIENT_ID, undefined, body.redirectUri);
        const { tokens } = await codeClient.getToken(body.code);
        if (!tokens.id_token) {
          res.status(401).json({ error: 'Failed to get ID token from Google' });
          return;
        }
        const ticket = await codeClient.verifyIdToken({
          idToken: tokens.id_token,
          audience: config.GOOGLE_CLIENT_ID,
        });
        const p = ticket.getPayload();
        if (!p?.email || !p?.sub) {
          res.status(401).json({ error: 'Invalid Google token' });
          return;
        }
        googleId = p.sub; email = p.email; name = p.name ?? undefined; picture = p.picture ?? undefined;
      } else {
        res.status(400).json({ error: 'credential or code+redirectUri is required' });
        return;
      }

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
