import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { ClipboardItem } from '@modushare/shared';

interface ClipboardRow {
  id: string;
  user_id: string;
  device_id: string;
  content_type: string;
  content_text: string | null;
  image_path: string | null;
  created_at: number;
  is_deleted: number;
}

function rowToItem(row: ClipboardRow): ClipboardItem {
  return {
    id: row.id,
    userId: row.user_id,
    deviceId: row.device_id,
    contentType: row.content_type as 'text' | 'image',
    contentText: row.content_text ?? undefined,
    imagePath: row.image_path ?? undefined,
    createdAt: row.created_at,
    isDeleted: row.is_deleted === 1,
  };
}

export const clipboardService = {
  saveClipboardItem(
    userId: string,
    deviceId: string,
    contentType: 'text' | 'image',
    content: string | null,
    imagePath: string | null
  ): ClipboardItem {
    const id = uuidv4();
    const now = Date.now();

    db.prepare(
      `INSERT INTO clipboard_items
         (id, user_id, device_id, content_type, content_text, image_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, userId, deviceId, contentType, content, imagePath, now);

    // Keep only latest 100 items per user
    this.cleanupOldItems(userId, 100);

    return {
      id,
      userId,
      deviceId,
      contentType,
      contentText: content ?? undefined,
      imagePath: imagePath ?? undefined,
      createdAt: now,
      isDeleted: false,
    };
  },

  getHistory(
    userId: string,
    limit = 50,
    offset = 0
  ): ClipboardItem[] {
    const rows = db
      .prepare<[string, number, number], ClipboardRow>(
        `SELECT * FROM clipboard_items
         WHERE user_id = ? AND is_deleted = 0
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(userId, limit, offset);
    return rows.map(rowToItem);
  },

  deleteItem(userId: string, itemId: string): boolean {
    const result = db
      .prepare(
        `UPDATE clipboard_items
         SET is_deleted = 1
         WHERE id = ? AND user_id = ?`
      )
      .run(itemId, userId);
    return result.changes > 0;
  },

  cleanupOldItems(userId: string, keepCount = 100): void {
    db.prepare(
      `DELETE FROM clipboard_items
       WHERE user_id = ?
         AND id NOT IN (
           SELECT id FROM clipboard_items
           WHERE user_id = ?
           ORDER BY created_at DESC
           LIMIT ?
         )`
    ).run(userId, userId, keepCount);
  },

  getItem(itemId: string): ClipboardItem | null {
    const row = db
      .prepare<string[], ClipboardRow>(
        'SELECT * FROM clipboard_items WHERE id = ? AND is_deleted = 0'
      )
      .get(itemId);
    return row ? rowToItem(row) : null;
  },
};
