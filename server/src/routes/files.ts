import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { config } from '../config';
import db from '../db';
import { userSessions } from '../websocket/userSessions';
import { WSMessage, FileTransferPayload } from '@modushare/shared';

const MAX_FILE_BYTES = config.MAX_CLIPBOARD_SIZE_MB * 1024 * 1024; // 5 MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(config.UPLOAD_DIR, 'files');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES },
});

const router = Router();

// ─── POST /files/send ─────────────────────────────────────────────────────────
// Upload a file and broadcast FILE_TRANSFER to share partners
router.post(
  '/send',
  requireAuth,
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file provided' });
        return;
      }

      const { userId } = (req as AuthenticatedRequest).user;
      const senderRow = db.prepare<string[], { email: string }>('SELECT email FROM users WHERE id = ?').get(userId);
      const senderEmail = senderRow?.email ?? '';

      const transferId = uuidv4();
      const relativePath = `files/${req.file.filename}`;
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const fileUrl = `${baseUrl}/files/download/${transferId}`;

      db.prepare(
        `INSERT INTO file_transfers (id, sender_id, file_name, file_size, mime_type, file_path, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(transferId, userId, req.file.originalname, req.file.size, req.file.mimetype, relativePath, Date.now());

      // Broadcast to share partners
      const outbound = db.prepare<string[], { target_id: string }>('SELECT target_id FROM share_pairs WHERE user_id = ?').all(userId);
      const inbound  = db.prepare<string[], { user_id: string }>('SELECT user_id FROM share_pairs WHERE target_id = ?').all(userId);
      const partnerIds = new Set([...outbound.map(r => r.target_id), ...inbound.map(r => r.user_id)]);

      const msg: WSMessage<FileTransferPayload> = {
        type: 'FILE_TRANSFER',
        payload: {
          transferId,
          fileName: req.file.originalname,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
          fileUrl,
          senderEmail,
        },
        timestamp: Date.now(),
        deviceId: 'server',
      };

      for (const partnerId of partnerIds) {
        userSessions.broadcastToUser(partnerId, msg);
      }

      res.status(201).json({ ok: true, transferId, fileUrl });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /files/download/:transferId ─────────────────────────────────────────
router.get(
  '/download/:transferId',
  requireAuth,
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = (req as AuthenticatedRequest).user;
      const { transferId } = req.params;

      const row = db.prepare<string[], {
        sender_id: string; file_name: string; file_path: string; mime_type: string;
      }>('SELECT sender_id, file_name, file_path, mime_type FROM file_transfers WHERE id = ?').get(transferId!);

      if (!row) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      // Allow sender or share partners to download
      const isPartner = db.prepare<string[], { cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM share_pairs
         WHERE (user_id = ? AND target_id = ?) OR (user_id = ? AND target_id = ?)`
      ).get(userId, row.sender_id, row.sender_id, userId);

      if (row.sender_id !== userId && (!isPartner || isPartner.cnt === 0)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const absolutePath = path.join(config.UPLOAD_DIR, row.file_path);
      if (!fs.existsSync(absolutePath)) {
        res.status(404).json({ error: 'File not found on disk' });
        return;
      }

      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.file_name)}"`);
      res.setHeader('Content-Type', row.mime_type);
      res.sendFile(absolutePath);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
