import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { imageService } from '../services/imageService';
import { config } from '../config';

const router = Router();

// Use memory storage so we can pass the buffer to sharp for validation
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.MAX_CLIPBOARD_SIZE_MB * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
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

// ─── GET /uploads/:userId/:filename ──────────────────────────────────────────
router.get(
  '/:userId/:filename',
  requireAuth,
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId: requestingUserId } = (req as AuthenticatedRequest).user;
      const { userId, filename } = req.params;

      // Only allow users to access their own uploads
      if (userId !== requestingUserId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
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
