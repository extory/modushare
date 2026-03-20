import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { ClipboardItem } from '@modushare/shared';

const AGING_OUT_MS = 10 * 60 * 1000;      // 10분
const QUOTA_BYTES  = 20 * 1024 * 1024;    // 20 MB per user

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
  /**
   * 저장 전 용량 검사. 초과 시 'QUOTA_EXCEEDED' 문자열 반환.
   * 정상이면 ClipboardItem 반환.
   */
  saveClipboardItem(
    userId: string,
    deviceId: string,
    contentType: 'text' | 'image',
    content: string | null,
    imagePath: string | null
  ): ClipboardItem | 'QUOTA_EXCEEDED' {
    // ── 용량 계산 ──────────────────────────────────────────────────────────
    const incomingBytes = content ? Buffer.byteLength(content, 'utf8') : 0;

    const usageRow = db
      .prepare<[string], { total: number }>(
        `SELECT COALESCE(SUM(LENGTH(COALESCE(content_text,''))), 0) AS total
         FROM clipboard_items
         WHERE user_id = ? AND is_deleted = 0`
      )
      .get(userId);

    const currentUsage = usageRow?.total ?? 0;
    if (currentUsage + incomingBytes > QUOTA_BYTES) {
      return 'QUOTA_EXCEEDED';
    }

    // ── 저장 ───────────────────────────────────────────────────────────────
    const id = uuidv4();
    const now = Date.now();

    db.prepare(
      `INSERT INTO clipboard_items
         (id, user_id, device_id, content_type, content_text, image_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, userId, deviceId, contentType, content, imagePath, now);

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

  getItem(itemId: string): ClipboardItem | null {
    const row = db
      .prepare<string[], ClipboardRow>(
        'SELECT * FROM clipboard_items WHERE id = ? AND is_deleted = 0'
      )
      .get(itemId);
    return row ? rowToItem(row) : null;
  },

  /** 10분 이상 된 항목 삭제 (서버 시작 시 + 주기적으로 호출) */
  pruneAgedItems(): void {
    const cutoff = Date.now() - AGING_OUT_MS;
    db.prepare(
      `DELETE FROM clipboard_items WHERE created_at < ?`
    ).run(cutoff);
  },

  /** 현재 사용량 반환 (bytes) */
  getUsageBytes(userId: string): number {
    const row = db
      .prepare<[string], { total: number }>(
        `SELECT COALESCE(SUM(LENGTH(COALESCE(content_text,''))), 0) AS total
         FROM clipboard_items
         WHERE user_id = ? AND is_deleted = 0`
      )
      .get(userId);
    return row?.total ?? 0;
  },
};
