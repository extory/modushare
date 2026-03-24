import { IncomingMessage, Server } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { WSMessage, ClipboardUpdatePayload, ClientHelloPayload, VersionMismatchPayload, FileTransferPayload } from '@modushare/shared';
import { authService } from '../services/authService';
import { userSessions } from './userSessions';
import { handleClipboardUpdate, handleSyncToggle } from './handlers';

const DOWNLOAD_URL = 'https://github.com/extory/modushare/releases/latest';

/** Compare two semver strings. Returns positive if a > b, negative if a < b, 0 if equal. */
function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const PING_INTERVAL_MS = 30_000;

export function attachWebSocketServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 10 * 1024 * 1024 }); // 10 MB

  // Handle HTTP upgrade
  httpServer.on('upgrade', (req: IncomingMessage, socket, head) => {
    const jwt = extractJwtFromProtocol(req.headers['sec-websocket-protocol']);
    if (!jwt) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const payload = authService.verifyAccessToken(jwt);
    if (!payload) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, payload.userId);
    });
  });

  wss.on(
    'connection',
    (ws: WebSocket, _req: IncomingMessage, userId: string) => {
      console.log(`[ws] Client connected: userId=${userId}`);
      userSessions.addSession(userId, ws);

      // Keepalive: send a PING every 30 s, close if no PONG received
      let isAlive = true;
      const pingTimer = setInterval(() => {
        if (!isAlive) {
          console.log(`[ws] No pong received, terminating userId=${userId}`);
          ws.terminate();
          return;
        }
        isAlive = false;
        const ping: WSMessage = {
          type: 'PING',
          timestamp: Date.now(),
          deviceId: 'server',
        };
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(ping));
        }
      }, PING_INTERVAL_MS);

      ws.on('message', async (data: WebSocket.Data) => {
        let msg: WSMessage;
        try {
          msg = JSON.parse(data.toString()) as WSMessage;
        } catch {
          return;
        }

        switch (msg.type) {
          case 'PONG':
            isAlive = true;
            break;

          case 'PING': {
            const pong: WSMessage = {
              type: 'PONG',
              timestamp: Date.now(),
              deviceId: 'server',
            };
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(pong));
            }
            isAlive = true;
            break;
          }

          case 'CLIPBOARD_UPDATE':
            await handleClipboardUpdate(
              userId,
              msg.deviceId,
              msg.payload as ClipboardUpdatePayload,
              ws
            );
            break;

          case 'SYNC_ENABLE':
            handleSyncToggle(userId, true);
            break;

          case 'SYNC_DISABLE':
            handleSyncToggle(userId, false);
            break;

          case 'CLIENT_HELLO': {
            const hello = msg.payload as ClientHelloPayload;
            const myVersion = hello?.clientVersion ?? '0.0.0';
            const myPlatform = hello?.platform ?? 'unknown';

            // Register this client's version
            userSessions.setClientMeta(ws, myVersion, myPlatform);

            // Compare against all other connected sessions of this user
            const peers = userSessions.getPeerMetas(userId, ws);
            for (const peer of peers) {
              const cmp = compareSemver(peer.version, myVersion);

              if (cmp > 0) {
                // Peer is newer — notify THIS client to upgrade
                const mismatch: WSMessage<VersionMismatchPayload> = {
                  type: 'VERSION_MISMATCH',
                  payload: { myVersion, peerVersion: peer.version, downloadUrl: DOWNLOAD_URL },
                  timestamp: Date.now(),
                  deviceId: 'server',
                };
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify(mismatch));
                }
              } else if (cmp < 0) {
                // This client is newer — notify the PEER to upgrade
                const mismatch: WSMessage<VersionMismatchPayload> = {
                  type: 'VERSION_MISMATCH',
                  payload: { myVersion: peer.version, peerVersion: myVersion, downloadUrl: DOWNLOAD_URL },
                  timestamp: Date.now(),
                  deviceId: 'server',
                };
                if (peer.ws.readyState === WebSocket.OPEN) {
                  peer.ws.send(JSON.stringify(mismatch));
                }
              }
            }
            break;
          }

          default:
            console.warn(`[ws] Unknown message type: ${msg.type}`);
        }
      });

      ws.on('close', () => {
        console.log(`[ws] Client disconnected: userId=${userId}`);
        clearInterval(pingTimer);
        userSessions.removeSession(userId, ws);
      });

      ws.on('error', (err) => {
        console.error(`[ws] Error for userId=${userId}:`, err.message);
      });
    }
  );

  return wss;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * The WS protocol header may look like "modushare, <jwt>" so that browsers
 * can include auth tokens (browsers cannot set custom WS headers).
 */
function extractJwtFromProtocol(
  header: string | string[] | undefined
): string | null {
  if (!header) return null;
  const raw = Array.isArray(header) ? header.join(', ') : header;
  // Support "modushare, <jwt>" or just the raw JWT
  const parts = raw.split(',').map((s) => s.trim());
  // Last non-"modushare" part is the token
  const token = parts.find((p) => p !== 'modushare') ?? parts[parts.length - 1];
  return token && token.length > 0 ? token! : null;
}
