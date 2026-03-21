import WebSocket from 'ws';
import db from '../db';

interface UserRow {
  sync_enabled: number;
}

// userId -> Set of open WebSocket connections for that user
const sessions = new Map<string, Set<WebSocket>>();

// ws -> { version, platform }
const clientMeta = new Map<WebSocket, { version: string; platform: string }>();

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
    clientMeta.delete(ws);
    if (set.size === 0) {
      sessions.delete(userId);
    }
  },

  setClientMeta(ws: WebSocket, version: string, platform: string): void {
    clientMeta.set(ws, { version, platform });
  },

  getClientMeta(ws: WebSocket): { version: string; platform: string } | undefined {
    return clientMeta.get(ws);
  },

  /** Return all sessions for a user except the given ws, along with their meta */
  getPeerMetas(userId: string, excludeWs: WebSocket): Array<{ ws: WebSocket; version: string; platform: string }> {
    const set = sessions.get(userId);
    if (!set) return [];
    const result: Array<{ ws: WebSocket; version: string; platform: string }> = [];
    for (const peer of set) {
      if (peer === excludeWs) continue;
      const meta = clientMeta.get(peer);
      if (meta) result.push({ ws: peer, ...meta });
    }
    return result;
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
    if (!row) return false;
    return row.sync_enabled === 1;
  },

  getSessionCount(userId: string): number {
    return sessions.get(userId)?.size ?? 0;
  },
};
