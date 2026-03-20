import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { clipboardService } from '../services/clipboardService';

const router = Router();

// ─── GET /clipboard/history ───────────────────────────────────────────────────
router.get(
  '/history',
  requireAuth,
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = (req as AuthenticatedRequest).user;
      const limit = Math.min(
        parseInt((req.query['limit'] as string) ?? '50', 10),
        200
      );
      const offset = parseInt((req.query['offset'] as string) ?? '0', 10);

      const items = clipboardService.getHistory(userId, limit, offset);

      // Rewrite imagePath to a full URL so the client can display it directly
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const enriched = items.map((item) => ({
        ...item,
        imageUrl: item.imagePath
          ? `${baseUrl}/uploads/${item.imagePath}`
          : undefined,
      }));

      res.json({ items: enriched, limit, offset });
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /clipboard/:id ────────────────────────────────────────────────────
router.delete(
  '/:id',
  requireAuth,
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = (req as AuthenticatedRequest).user;
      const { id } = req.params;

      const deleted = clipboardService.deleteItem(userId, id!);
      if (!deleted) {
        res.status(404).json({ error: 'Item not found' });
        return;
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
