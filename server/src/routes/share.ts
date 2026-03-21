import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { userSessions } from '../websocket/userSessions';

const router = Router();

interface UserRow { id: string; username: string; email: string; }

interface SharePairRow {
  id: string; user_id: string; target_id: string; created_at: number;
  target_username: string; target_email: string;
}

interface InvitationRow {
  id: string; from_id: string; to_id: string; status: string;
  created_at: number; updated_at: number;
  from_username: string; from_email: string;
  to_username: string; to_email: string;
}

// ─── GET /share – list my share partners ─────────────────────────────────────
router.get('/', requireAuth, (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const rows = db.prepare<string[], SharePairRow>(
    `SELECT sp.id, sp.user_id, sp.target_id, sp.created_at,
            u.username AS target_username, u.email AS target_email
     FROM share_pairs sp
     JOIN users u ON u.id = sp.target_id
     WHERE sp.user_id = ?
     ORDER BY sp.created_at DESC`
  ).all(userId);
  res.json({
    partners: rows.map((r) => ({
      id: r.id, userId: r.target_id,
      username: r.target_username, email: r.target_email,
    })),
  });
});

// ─── DELETE /share/:targetId – remove share partner ──────────────────────────
router.delete('/:targetId', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const { targetId } = req.params;
    db.prepare('DELETE FROM share_pairs WHERE user_id = ? AND target_id = ?').run(userId, targetId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── GET /share/invitations – list pending invitations I received ─────────────
router.get('/invitations', requireAuth, (req: Request, res: Response) => {
  const { userId } = (req as AuthenticatedRequest).user;
  const rows = db.prepare<string[], InvitationRow>(
    `SELECT si.id, si.from_id, si.to_id, si.status, si.created_at, si.updated_at,
            u.username AS from_username, u.email AS from_email
     FROM share_invitations si
     JOIN users u ON u.id = si.from_id
     WHERE si.to_id = ? AND si.status = 'pending'
     ORDER BY si.created_at DESC`
  ).all(userId);
  res.json({
    invitations: rows.map((r) => ({
      id: r.id, fromId: r.from_id,
      fromUsername: r.from_username, fromEmail: r.from_email,
      createdAt: r.created_at,
    })),
  });
});

// ─── POST /share/invite – send invitation by email ───────────────────────────
router.post('/invite', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const { email } = req.body as { email?: string };
    if (!email) { res.status(400).json({ error: 'email is required' }); return; }

    const target = db.prepare<string[], UserRow>(
      'SELECT id, username, email FROM users WHERE email = ?'
    ).get(email.trim().toLowerCase());

    if (!target) { res.status(404).json({ error: '해당 이메일의 사용자를 찾을 수 없습니다' }); return; }
    if (target.id === userId) { res.status(400).json({ error: '자기 자신을 초대할 수 없습니다' }); return; }

    // 이미 공유 중인지 확인
    const alreadyPaired = db.prepare(
      'SELECT id FROM share_pairs WHERE user_id = ? AND target_id = ?'
    ).get(userId, target.id);
    if (alreadyPaired) { res.status(409).json({ error: '이미 공유 중인 사용자입니다' }); return; }

    // 이미 초대 중인지 확인
    const existing = db.prepare(
      "SELECT id, status FROM share_invitations WHERE from_id = ? AND to_id = ?"
    ).get(userId, target.id) as { id: string; status: string } | undefined;

    if (existing) {
      if (existing.status === 'pending') {
        res.status(409).json({ error: '이미 초대를 보낸 사용자입니다' }); return;
      }
      // rejected였으면 다시 초대 가능 - 업데이트
      db.prepare(
        "UPDATE share_invitations SET status = 'pending', updated_at = ? WHERE id = ?"
      ).run(Date.now(), existing.id);
    } else {
      db.prepare(
        'INSERT INTO share_invitations (id, from_id, to_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(uuidv4(), userId, target.id, 'pending', Date.now(), Date.now());
    }

    // 초대받은 사람에게 실시간 알림
    const fromUser = db.prepare<string[], UserRow>(
      'SELECT id, username, email FROM users WHERE id = ?'
    ).get(userId) as UserRow;

    userSessions.broadcastToUser(target.id, {
      type: 'SHARE_INVITATION',
      payload: {
        fromId: userId,
        fromUsername: fromUser.username,
        fromEmail: fromUser.email,
      },
      timestamp: Date.now(),
      deviceId: 'server',
    });

    res.status(201).json({ ok: true, toEmail: target.email, toUsername: target.username });
  } catch (err) { next(err); }
});

// ─── POST /share/invitations/:id/accept ──────────────────────────────────────
router.post('/invitations/:id/accept', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const { id } = req.params;

    const inv = db.prepare(
      "SELECT * FROM share_invitations WHERE id = ? AND to_id = ? AND status = 'pending'"
    ).get(id, userId) as InvitationRow | undefined;

    if (!inv) { res.status(404).json({ error: '초대를 찾을 수 없습니다' }); return; }

    // 초대 수락: share_pairs에 양방향 추가 (초대자→수락자)
    const existing = db.prepare(
      'SELECT id FROM share_pairs WHERE user_id = ? AND target_id = ?'
    ).get(inv.from_id, userId);

    if (!existing) {
      db.prepare(
        'INSERT INTO share_pairs (id, user_id, target_id, created_at) VALUES (?, ?, ?, ?)'
      ).run(uuidv4(), inv.from_id, userId, Date.now());
    }

    db.prepare(
      "UPDATE share_invitations SET status = 'accepted', updated_at = ? WHERE id = ?"
    ).run(Date.now(), id);

    // 초대한 사람에게 수락 알림
    const toUser = db.prepare<string[], UserRow>(
      'SELECT id, username, email FROM users WHERE id = ?'
    ).get(userId) as UserRow;

    userSessions.broadcastToUser(inv.from_id, {
      type: 'SHARE_ACCEPTED',
      payload: { byId: userId, byUsername: toUser.username, byEmail: toUser.email },
      timestamp: Date.now(),
      deviceId: 'server',
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── POST /share/invitations/:id/reject ──────────────────────────────────────
router.post('/invitations/:id/reject', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const { id } = req.params;

    const inv = db.prepare(
      "SELECT * FROM share_invitations WHERE id = ? AND to_id = ? AND status = 'pending'"
    ).get(id, userId);

    if (!inv) { res.status(404).json({ error: '초대를 찾을 수 없습니다' }); return; }

    db.prepare(
      "UPDATE share_invitations SET status = 'rejected', updated_at = ? WHERE id = ?"
    ).run(Date.now(), id);

    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
