import WebSocket from 'ws';
import { ClipboardUpdatePayload, WSMessage } from '@modushare/shared';
import db from '../db';
import { clipboardService } from '../services/clipboardService';
import { imageService } from '../services/imageService';
import { userSessions } from './userSessions';
import { config } from '../config';

// ~5 MB expressed as a base64 character count (4/3 ratio)
const MAX_INLINE_BASE64_CHARS = Math.ceil((5 * 1024 * 1024 * 4) / 3);

export async function handleClipboardUpdate(
  userId: string,
  deviceId: string,
  payload: ClipboardUpdatePayload,
  senderWs: WebSocket
): Promise<void> {
  console.log(`[clipboard] UPDATE from userId=${userId} type=${payload.contentType}`);

  const senderRow = db.prepare<string[], { email: string }>('SELECT email FROM users WHERE id = ?').get(userId);
  const senderEmail = senderRow?.email ?? '';

  if (!userSessions.getSyncEnabled(userId)) {
    console.log(`[clipboard] sync disabled for userId=${userId}`);
    sendError(senderWs, 'SYNC_DISABLED', 'Sync is currently disabled');
    return;
  }

  let contentText: string | null = null;
  let imagePath: string | null = null;

  if (payload.contentType === 'text') {
    if (!payload.content) {
      sendError(senderWs, 'INVALID_PAYLOAD', 'Text content is required');
      return;
    }
    const maxBytes = config.MAX_CLIPBOARD_SIZE_MB * 1024 * 1024;
    if (Buffer.byteLength(payload.content, 'utf8') > maxBytes) {
      sendError(senderWs, 'TOO_LARGE', `텍스트가 ${config.MAX_CLIPBOARD_SIZE_MB}MB를 초과합니다.`);
      return;
    }
    contentText = payload.content;
  } else if (payload.contentType === 'image') {
    if (payload.imageData) {
      // Inline base64 image – reject if too large
      if (payload.imageData.length > MAX_INLINE_BASE64_CHARS) {
        sendError(senderWs, 'TOO_LARGE', '이미지가 5MB를 초과합니다.');
        return;
      }
      // Save base64 to disk
      try {
        const buffer = Buffer.from(payload.imageData, 'base64');
        imagePath = await imageService.validateAndSaveImage(buffer, userId);
      } catch (err) {
        sendError(senderWs, 'INVALID_IMAGE', 'Could not process image');
        return;
      }
    } else if (payload.imageUrl) {
      // Already uploaded – extract the relative path from the URL
      const match = payload.imageUrl.match(/\/uploads\/(.+)$/);
      imagePath = match ? match[1]! : null;
    } else {
      sendError(senderWs, 'INVALID_PAYLOAD', 'Image data or URL is required');
      return;
    }
  } else {
    sendError(senderWs, 'INVALID_CONTENT_TYPE', 'Unknown content type');
    return;
  }

  const result = clipboardService.saveClipboardItem(
    userId,
    deviceId,
    payload.contentType,
    contentText,
    imagePath
  );

  if (result === 'QUOTA_EXCEEDED') {
    sendError(senderWs, 'QUOTA_EXCEEDED', '저장 용량(20MB)을 초과했습니다. 기존 항목이 정리된 후 다시 시도해주세요.');
    return;
  }

  const item = result;

  // Build broadcast payload (don't re-send large base64 blobs)
  const broadcastPayload: ClipboardUpdatePayload & { itemId: string; senderEmail: string } = {
    contentType: payload.contentType,
    itemId: item.id,
    senderEmail,
    ...(contentText !== null ? { content: contentText } : {}),
    ...(imagePath ? { imageUrl: `/uploads/${imagePath}` } : {}),
  };

  const message: WSMessage<typeof broadcastPayload> = {
    type: 'CLIPBOARD_UPDATE',
    payload: broadcastPayload,
    timestamp: item.createdAt,
    deviceId,
  };

  userSessions.broadcastToUser(userId, message, senderWs);

  // Broadcast to share partners:
  // 1. Users this sender has added as targets (user_id=userId → target_id)
  // 2. Users who have added this sender as their target (target_id=userId → user_id)
  const outboundRows = db
    .prepare<string[], { target_id: string }>(
      'SELECT target_id FROM share_pairs WHERE user_id = ?'
    )
    .all(userId);
  const inboundRows = db
    .prepare<string[], { user_id: string }>(
      'SELECT user_id FROM share_pairs WHERE target_id = ?'
    )
    .all(userId);

  const partnerIds = new Set([
    ...outboundRows.map(r => r.target_id),
    ...inboundRows.map(r => r.user_id),
  ]);

  console.log(`[clipboard] partnerIds to broadcast: [${[...partnerIds].join(', ')}]`);
  for (const partnerId of partnerIds) {
    const count = userSessions.getSessionCount(partnerId);
    console.log(`[clipboard] broadcasting to partnerId=${partnerId} sessions=${count}`);
    userSessions.broadcastToUser(partnerId, message);
  }

  // Send ack to sender (include how many other devices received the update)
  const partnerSessionCount = [...partnerIds].reduce(
    (sum, pid) => sum + userSessions.getSessionCount(pid),
    0
  );
  const sharedWithCount = userSessions.getSessionCount(userId) - 1 + partnerSessionCount; // exclude sender
  const ack: WSMessage<{ itemId: string; sharedWithCount: number }> = {
    type: 'CLIPBOARD_ACK',
    payload: { itemId: item.id, sharedWithCount: Math.max(0, sharedWithCount) },
    timestamp: Date.now(),
    deviceId: 'server',
  };
  if (senderWs.readyState === WebSocket.OPEN) {
    senderWs.send(JSON.stringify(ack));
  }
}

export function handleSyncToggle(userId: string, enabled: boolean): void {
  db.prepare('UPDATE users SET sync_enabled = ? WHERE id = ?').run(
    enabled ? 1 : 0,
    userId
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sendError(ws: WebSocket, code: string, message: string): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  const msg: WSMessage<{ code: string; message: string }> = {
    type: 'ERROR',
    payload: { code, message },
    timestamp: Date.now(),
    deviceId: 'server',
  };
  ws.send(JSON.stringify(msg));
}
