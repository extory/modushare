import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { imageService } from '../services/imageService';
import { config } from '../config';
import db from '../db';

const router = Router();

const MAX_FILE_BYTES = config.MAX_CLIPBOARD_SIZE_MB * 1024 * 1024;

// Use memory storage so we can pass the buffer to sharp for validation
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

const fileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
});

// ─── POST /upload/image ───────────────────────────────────────────────────────
router.post(
  '/image',
  requireAuth,
  upload.single('image'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No image file provided' });
        return;
      }

      const { userId } = (req as AuthenticatedRequest).user;
      const relativePath = await imageService.validateAndSaveImage(
        req.file.buffer,
        userId
      );

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const imageUrl = `${baseUrl}/uploads/${relativePath}`;

      res.status(201).json({ imageUrl, relativePath });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /upload/file ────────────────────────────────────────────────────────
router.post(
  '/file',
  requireAuth,
  fileUpload.single('file'),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file provided' });
        return;
      }
      const { userId } = (req as AuthenticatedRequest).user;
      const userUploadDir = path.join(config.UPLOAD_DIR, userId);
      if (!fs.existsSync(userUploadDir)) {
        fs.mkdirSync(userUploadDir, { recursive: true });
      }
      const ext = path.extname(req.file.originalname) || '';
      const filename = `${uuidv4()}${ext}`;
      const absolutePath = path.join(userUploadDir, filename);
      fs.writeFileSync(absolutePath, req.file.buffer);

      const relativePath = `${userId}/${filename}`;
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const fileUrl = `${baseUrl}/uploads/${relativePath}`;

      res.status(201).json({
        fileUrl,
        relativePath,
        fileName: req.file.originalname,
        fileSize: req.file.size,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /uploads/:userId/:filename ──────────────────────────────────────────
router.get(
  '/:userId/:filename',
  requireAuth,
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId: requestingUserId } = (req as AuthenticatedRequest).user;
      const { userId, filename } = req.params;

      // Allow own files or share partners
      if (userId !== requestingUserId) {
        const isPartner = db.prepare<[string, string, string, string], { id: string }>(
          `SELECT id FROM share_pairs WHERE (user_id = ? AND target_id = ?) OR (user_id = ? AND target_id = ?) LIMIT 1`
        ).get(requestingUserId, userId, userId, requestingUserId);
        if (!isPartner) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
      }

      // Prevent path traversal
      const safeFilename = path.basename(filename!);
      const absolutePath = imageService.getAbsolutePath(
        `${userId}/${safeFilename}`
      );

      if (!fs.existsSync(absolutePath)) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      res.sendFile(absolutePath);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
