import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { clipboard, nativeImage, Notification } from 'electron';
import crypto from 'crypto';
import Store from 'electron-store';
import { AppStore } from './main';
import { ClipboardChangedEvent } from './clipboardPoller';

const MAX_INLINE_BYTES = 512 * 1024; // 512 KB
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

interface WSEnvelope {
  type: string;
  payload?: Record<string, unknown>;
  timestamp: number;
  deviceId: string;
}

export class WSClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private backoff = INITIAL_BACKOFF_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;
  private poller: import('./clipboardPoller').ClipboardPoller | null = null;
  private hasShownFirstCopyToast = false;

  constructor(private readonly store: Store<AppStore>) {
    super();
  }

  setPoller(poller: import('./clipboardPoller').ClipboardPoller): void {
    this.poller = poller;
  }

  connect(): void {
    const token = this.store.get('accessToken');
    if (!token) return;

    const serverUrl = this.store.get('serverUrl').replace(/^http/, 'ws');
    const wsUrl = `${serverUrl}`;

    try {
      this.ws = new WebSocket(wsUrl, ['modushare', token]);

      this.ws.on('open', () => {
        console.log('[ws] Connected');
        this.connected = true;
        this.backoff = INITIAL_BACKOFF_MS;
        this.emit('statusChange');
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString()) as WSEnvelope;
          this.handleMessage(msg);
        } catch {
          // ignore
        }
      });

      this.ws.on('close', () => {
        this.connected = false;
        this.ws = null;
        this.emit('statusChange');
        this.scheduleReconnect();
      });

      this.ws.on('error', (err) => {
        console.error('[ws] Error:', err.message);
        this.ws?.terminate();
      });
    } catch (err) {
      console.error('[ws] Connection failed:', err);
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  sendClipboardUpdate(event: ClipboardChangedEvent): void {
    if (!this.connected || !this.ws) return;

    const deviceId = this.store.get('deviceId');
    let payload: Record<string, unknown>;

    if (event.type === 'text') {
      payload = { contentType: 'text', content: event.text };
    } else {
      if (event.imageSize && event.imageSize <= MAX_INLINE_BYTES) {
        payload = {
          contentType: 'image',
          imageData: event.imageBase64,
        };
      } else {
        // TODO: upload via REST and then send imageUrl
        // For now, skip oversized images
        console.warn('[ws] Image too large for inline send, upload not yet implemented in desktop client');
        return;
      }
    }

    const msg: WSEnvelope = {
      type: 'CLIPBOARD_UPDATE',
      payload,
      timestamp: Date.now(),
      deviceId,
    };

    this.ws.send(JSON.stringify(msg));
  }

  sendSyncEnable(): void {
    this.sendRaw({ type: 'SYNC_ENABLE', timestamp: Date.now(), deviceId: this.store.get('deviceId') });
  }

  sendSyncDisable(): void {
    this.sendRaw({ type: 'SYNC_DISABLE', timestamp: Date.now(), deviceId: this.store.get('deviceId') });
  }

  private sendRaw(msg: WSEnvelope): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private handleMessage(msg: WSEnvelope): void {
    switch (msg.type) {
      case 'PING':
        this.sendRaw({ type: 'PONG', timestamp: Date.now(), deviceId: this.store.get('deviceId') });
        break;

      case 'CLIPBOARD_UPDATE': {
        const payload = msg.payload as {
          contentType?: string;
          content?: string;
          imageData?: string;
          imageUrl?: string;
        };
        if (payload.contentType === 'text' && payload.content) {
          const hash = crypto
            .createHash('sha256')
            .update(Buffer.from(payload.content, 'utf-8'))
            .digest('hex');
          if (this.poller) this.poller.lastReceivedHash = hash;
          clipboard.writeText(payload.content);
        } else if (payload.contentType === 'image' && payload.imageData) {
          const buf = Buffer.from(payload.imageData, 'base64');
          const hash = crypto.createHash('sha256').update(buf).digest('hex');
          if (this.poller) this.poller.lastReceivedHash = hash;
          const img = nativeImage.createFromBuffer(buf);
          clipboard.writeImage(img);
        }
        // 다른 기기에서 복사한 내역 → 트레이 이펙트 발동
        this.emit('remoteClipboard');
        break;
      }

      case 'ERROR': {
        const errPayload = msg.payload as { code?: string };
        if (errPayload?.code === 'QUOTA_EXCEEDED') {
          this.emit('quotaExceeded');
        }
        break;
      }

      case 'CLIPBOARD_ACK': {
        if (!this.hasShownFirstCopyToast) {
          this.hasShownFirstCopyToast = true;
          const sharedWithCount = (msg.payload as { sharedWithCount?: number })?.sharedWithCount ?? 0;
          const body = sharedWithCount > 0
            ? `${sharedWithCount}개의 다른 기기와 공유되고 있습니다`
            : '클립보드 동기화가 활성화되어 있습니다';
          new Notification({ title: 'ModuShare', body }).show();
        }
        break;
      }

      case 'SYNC_ENABLE':
        this.store.set('syncEnabled', true);
        this.emit('statusChange');
        break;

      case 'SYNC_DISABLE':
        this.store.set('syncEnabled', false);
        this.emit('statusChange');
        break;

      default:
        break;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    console.log(`[ws] Reconnecting in ${this.backoff}ms…`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.backoff);
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
  }
}
