import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/adminAuth';
import db from '../db';

const router = Router();

router.use(requireAuth as any);
router.use(requireAdmin as any);

// ─── GET /admin/users ─────────────────────────────────────────────────────────
// Member list: email, signup date, login method
router.get('/users', (_req: AuthenticatedRequest, res: Response) => {
  const users = db.prepare(`
    SELECT
      u.id,
      u.username,
      u.email,
      u.created_at,
      u.login_method,
      COALESCE(stats.item_count, 0) AS item_count,
      COALESCE(stats.text_bytes, 0) AS text_bytes
    FROM users u
    LEFT JOIN v_user_clipboard_stats stats ON stats.user_id = u.id
    ORDER BY u.created_at DESC
  `).all();

  res.json({ users });
});

// ─── GET /admin/stats ─────────────────────────────────────────────────────────
// Share counts: daily / weekly / monthly
router.get('/stats', (_req: AuthenticatedRequest, res: Response) => {
  const now = Date.now();
  const oneDayAgo   = now - 86_400_000;
  const oneWeekAgo  = now - 7 * 86_400_000;
  const oneMonthAgo = now - 30 * 86_400_000;

  // Share pair creation counts
  const shareStats = db.prepare(`
    SELECT
      COUNT(CASE WHEN created_at >= ? THEN 1 END) AS daily,
      COUNT(CASE WHEN created_at >= ? THEN 1 END) AS weekly,
      COUNT(CASE WHEN created_at >= ? THEN 1 END) AS monthly,
      COUNT(*) AS total
    FROM share_pairs
  `).get(oneDayAgo, oneWeekAgo, oneMonthAgo) as {
    daily: number; weekly: number; monthly: number; total: number;
  };

  // Clipboard item counts
  const clipStats = db.prepare(`
    SELECT
      COUNT(CASE WHEN created_at >= ? AND is_deleted = 0 THEN 1 END) AS daily,
      COUNT(CASE WHEN created_at >= ? AND is_deleted = 0 THEN 1 END) AS weekly,
      COUNT(CASE WHEN created_at >= ? AND is_deleted = 0 THEN 1 END) AS monthly,
      COUNT(CASE WHEN is_deleted = 0 THEN 1 END) AS total
    FROM clipboard_items
  `).get(oneDayAgo, oneWeekAgo, oneMonthAgo) as {
    daily: number; weekly: number; monthly: number; total: number;
  };

  // Total storage in use (text_bytes across all active items)
  const storageRow = db.prepare(`
    SELECT COALESCE(SUM(LENGTH(COALESCE(content_text, ''))), 0) AS total_bytes
    FROM clipboard_items
    WHERE is_deleted = 0
  `).get() as { total_bytes: number };

  // User counts
  const userCounts = db.prepare(`
    SELECT
      COUNT(*) AS total,
      COUNT(CASE WHEN login_method = 'google' THEN 1 END) AS google,
      COUNT(CASE WHEN login_method = 'email'  THEN 1 END) AS email
    FROM users
  `).get() as { total: number; google: number; email: number };

  res.json({
    shares: shareStats,
    clipboard: clipStats,
    storage: { total_bytes: storageRow.total_bytes },
    users: userCounts,
  });
});

// ─── GET /admin/storage ───────────────────────────────────────────────────────
// Per-user storage breakdown
router.get('/storage', (_req: AuthenticatedRequest, res: Response) => {
  const rows = db.prepare(`
    SELECT
      u.id,
      u.email,
      u.username,
      COALESCE(SUM(LENGTH(COALESCE(ci.content_text, ''))), 0) AS text_bytes,
      COUNT(CASE WHEN ci.is_deleted = 0 THEN 1 END) AS item_count
    FROM users u
    LEFT JOIN clipboard_items ci ON ci.user_id = u.id AND ci.is_deleted = 0
    GROUP BY u.id, u.email, u.username
    ORDER BY text_bytes DESC
  `).all();

  res.json({ users: rows });
});

export default router;
