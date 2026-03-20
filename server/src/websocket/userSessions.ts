import WebSocket from 'ws';
import db from '../db';

interface UserRow {
  sync_enabled: number;
}

// userId -> Set of open WebSocket connections for that user
const sessions = new Map<string, Set<WebSocket>>();

export const userSessions = {
  addSession(userId: string, ws: WebSocket): void {
    if (!sessions.has(userId)) {
      sessions.set(userId, new Set());
    }
    sessions.get(userId)!.add(ws);
  },

  removeSession(userId: string, ws: WebSocket): void {
    const set = sessions.get(userId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) {
      sessions.delete(userId);
    }
  },

  broadcastToUser(
    userId: string,
    message: object,
    excludeWs?: WebSocket
  ): void {
    const set = sessions.get(userId);
    if (!set) return;

    const payload = JSON.stringify(message);
    for (const ws of set) {
      if (ws === excludeWs) continue;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  },

  getSyncEnabled(userId: string): boolean {
    const row = db
      .prepare<string[], UserRow>(
        'SELECT sync_enabled FROM users WHERE id = ?'
      )
      .get(userId);
    return row?.sync_enabled === 1 ?? false;
  },

  getSessionCount(userId: string): number {
    return sessions.get(userId)?.size ?? 0;
  },
};
