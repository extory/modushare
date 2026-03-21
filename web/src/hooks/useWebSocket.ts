import { useEffect, useRef, useCallback, useState } from 'react';
import { WSMessage } from '@modushare/shared';

type MessageHandler = (msg: WSMessage) => void;

interface UseWebSocketOptions {
  token: string | null;
  onMessage: MessageHandler;
  deviceId: string;
}

const WS_BASE = import.meta.env['VITE_WS_URL'] ?? `ws://${location.host}`;
const MAX_BACKOFF_MS = 30_000;
const CLIENT_VERSION = import.meta.env['VITE_APP_VERSION'] as string ?? '0.0.0';

export function useWebSocket({
  token,
  onMessage,
  deviceId,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(1_000);
  const [isConnected, setIsConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (!token) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_BASE, ['modushare', token]);
    wsRef.current = ws;

    ws.addEventListener('open', () => {
      setIsConnected(true);
      backoffRef.current = 1_000; // reset backoff on success
      // Announce version so server can detect mismatches
      const hello: WSMessage = {
        type: 'CLIENT_HELLO',
        payload: { clientVersion: CLIENT_VERSION, platform: 'web' } as unknown as undefined,
        timestamp: Date.now(),
        deviceId,
      };
      ws.send(JSON.stringify(hello));
    });

    ws.addEventListener('message', (event: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(event.data) as WSMessage;
        if (msg.type === 'PING') {
          sendMessage({ type: 'PONG', timestamp: Date.now(), deviceId });
          return;
        }
        onMessageRef.current(msg);
      } catch {
        // ignore malformed messages
      }
    });

    ws.addEventListener('close', () => {
      setIsConnected(false);
      wsRef.current = null;
      if (!token) return;
      const delay = backoffRef.current;
      backoffRef.current = Math.min(delay * 2, MAX_BACKOFF_MS);
      reconnectTimer.current = setTimeout(connect, delay);
    });

    ws.addEventListener('error', () => {
      ws.close();
    });
  }, [token, deviceId]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback(
    (msg: Omit<WSMessage, 'deviceId'> & { deviceId?: string }) => {
      const full: WSMessage = { deviceId, ...msg };
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(full));
      }
    },
    [deviceId]
  );

  return { isConnected, sendMessage };
}
