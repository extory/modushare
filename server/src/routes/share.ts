import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

interface UserRow {
  id: string;
  username: string;
  email: string;
}

interface SharePairRow {
  id: string;
  user_id: string;
  target_id: string;
  created_at: number;
  target_username: string;
  target_email: string;
}

// ─── GET /share – list my share targets ───────────────────────────────────────
router.get('/', requireAuth, (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const rows = db
    .prepare<string[], SharePairRow>(
      `SELECT sp.id, sp.user_id, sp.target_id, sp.created_at,
              u.username AS target_username, u.email AS target_email
       FROM share_pairs sp
       JOIN users u ON u.id = sp.target_id
       WHERE sp.user_id = ?
       ORDER BY sp.created_at DESC`
    )
    .all(userId);
  res.json({
    partners: rows.map((r) => ({
      id: r.id,
      userId: r.target_id,
      username: r.target_username,
      email: r.target_email,
    })),
  });
});

// ─── POST /share – add share target by email ──────────────────────────────────
router.post(
  '/',
  requireAuth,
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = (req as AuthenticatedRequest).user;
      const { email } = req.body as { email?: string };
      if (!email) {
        res.status(400).json({ error: 'email is required' });
        return;
      }

      const target = db
        .prepare<string[], UserRow>(
          'SELECT id, username, email FROM users WHERE email = ?'
        )
        .get(email.trim().toLowerCase());

      if (!target) {
        res
          .status(404)
          .json({ error: '해당 이메일의 사용자를 찾을 수 없습니다' });
        return;
      }

      if (target.id === userId) {
        res
          .status(400)
          .json({ error: '자기 자신을 공유 대상으로 추가할 수 없습니다' });
        return;
      }

      const existing = db
        .prepare('SELECT id FROM share_pairs WHERE user_id = ? AND target_id = ?')
        .get(userId, target.id);

      if (existing) {
        res.status(409).json({ error: '이미 공유 중인 사용자입니다' });
        return;
      }

      const id = uuidv4();
      db.prepare(
        'INSERT INTO share_pairs (id, user_id, target_id, created_at) VALUES (?, ?, ?, ?)'
      ).run(id, userId, target.id, Date.now());

      res
        .status(201)
        .json({
          id,
          userId: target.id,
          username: target.username,
          email: target.email,
        });
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /share/:targetId – remove share target ────────────────────────────
router.delete(
  '/:targetId',
  requireAuth,
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = (req as AuthenticatedRequest).user;
      const { targetId } = req.params;
      db.prepare(
        'DELETE FROM share_pairs WHERE user_id = ? AND target_id = ?'
      ).run(userId, targetId);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
