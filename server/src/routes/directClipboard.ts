import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { userSessions } from '../websocket/userSessions';

const router = Router();
router.use(requireAuth);
const allowedUsers = (userId: string): Set<string> => new Set([userId, ...db.prepare<[string, string], { id: string }>(
  'SELECT target_id AS id FROM share_pairs WHERE user_id = ? UNION SELECT user_id AS id FROM share_pairs WHERE target_id = ?'
).all(userId, userId).map(r => r.id)]);

router.get('/targets', (req, res) => {
  const userId = (req as unknown as AuthenticatedRequest).user.userId;
  const allowed = allowedUsers(userId);
  const devices = db.prepare<[], { userId: string; deviceId: string; name: string; email: string }>(
    'SELECT d.user_id AS userId, d.device_id AS deviceId, d.name, u.email FROM clipboard_devices d JOIN users u ON u.id = d.user_id'
  ).all().filter(d => allowed.has(d.userId));
  res.json({ devices });
});
router.get('/inbox/:deviceId', (req, res) => {
  const rows = db.prepare<[string, string], { id: string; senderEmail: string; payload: string; createdAt: number }>(
    'SELECT id, sender_email AS senderEmail, payload, created_at AS createdAt FROM clipboard_deliveries WHERE user_id = ? AND device_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 10'
  ).all((req as unknown as AuthenticatedRequest).user.userId, req.params.deviceId!);
  res.json({ items: rows.map(r => ({ ...r, payload: JSON.parse(r.payload) })) });
});
router.post('/send', (req, res, next) => {
  try {
    const userId = (req as unknown as AuthenticatedRequest).user.userId;
    const { targets, payload } = req.body ?? {};
    if (!Array.isArray(targets) || !targets.length || targets.length > 50 || !payload ||
        !['text', 'image'].includes(payload.contentType)) {
      res.status(400).json({ error: '공유 대상과 텍스트 또는 이미지가 필요합니다.' }); return;
    }
    const content = payload.contentType === 'text' ? payload.content : payload.imageData;
    if (typeof content !== 'string' || !content.length ||
        Buffer.byteLength(content, payload.contentType === 'text' ? 'utf8' : 'base64') > 5 * 1024 * 1024 ||
        (payload.contentType === 'image' && !/^[A-Za-z0-9+/]+={0,2}$/.test(content))) {
      res.status(400).json({ error: '최대 5MB의 텍스트 또는 이미지를 보내세요.' }); return;
    }
    const allowed = allowedUsers(userId);
    const unique = new Map<string, { userId: string; deviceId: string }>();
    for (const t of targets) {
      if (!t || typeof t.userId !== 'string' || typeof t.deviceId !== 'string' || !allowed.has(t.userId) ||
          !db.prepare('SELECT 1 FROM clipboard_devices WHERE user_id = ? AND device_id = ?').get(t.userId, t.deviceId)) {
        res.status(403).json({ error: '공유할 수 없는 기기가 포함되어 있습니다.' }); return;
      }
      unique.set(JSON.stringify([t.userId, t.deviceId]), t);
    }
    const clean = payload.contentType === 'text' ? { contentType: 'text', content } : { contentType: 'image', imageData: content };
    const email = db.prepare<[string], { email: string }>('SELECT email FROM users WHERE id = ?').get(userId)!.email;
    const createdAt = Date.now();
    db.transaction(() => {
      for (const t of unique.values()) {
        db.prepare('INSERT INTO clipboard_deliveries VALUES (?, ?, ?, ?, ?, ?)').run(randomUUID(), t.userId, t.deviceId, email, JSON.stringify(clean), createdAt);
        db.prepare(`DELETE FROM clipboard_deliveries WHERE user_id = ? AND device_id = ? AND id NOT IN
          (SELECT id FROM clipboard_deliveries WHERE user_id = ? AND device_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 10)`)
          .run(t.userId, t.deviceId, t.userId, t.deviceId);
      }
    })();
    for (const t of unique.values()) userSessions.broadcastToUser(t.userId, {
      type: 'CLIPBOARD_DELIVERY', payload: { targetDeviceId: t.deviceId }, timestamp: createdAt, deviceId: 'server',
    });
    res.json({ ok: true, count: unique.size });
  } catch (error) { next(error); }
});
export default router;
