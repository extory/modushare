import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { app, clipboard, nativeImage, Notification } from 'electron';
import axios from 'axios';
import Store from 'electron-store';
import { AppStore } from './main';
import { ClipboardChangedEvent } from './clipboardPoller';

const MAX_INLINE_BYTES = 5 * 1024 * 1024; // 5 MB
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const CLIENT_VERSION = app.getVersion();
const CLIENT_PLATFORM = process.platform === 'darwin' ? 'macos' : 'windows';

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
  private refreshing = false;
  private poller: import('./clipboardPoller').ClipboardPoller | null = null;
  private clipboardGeneration = 0;
  private intentionallyDisconnected = false;
  private hasShownFirstCopyToast = false;
  private hasShownVersionToast = false;

  constructor(private readonly store: Store<AppStore>) {
    super();
  }

  setPoller(poller: import('./clipboardPoller').ClipboardPoller): void {
    this.poller = poller;
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.intentionallyDisconnected = false;
    const token = this.store.get('accessToken');
    if (!token) return;

    const serverUrl = this.store.get('serverUrl').replace(/^http/, 'ws');
    const wsUrl = `${serverUrl}`;

    try {
      this.ws = new WebSocket(wsUrl, ['modushare', token]);

      const connection = this.ws;
      this.ws.on('open', () => {
        if (this.ws !== connection) return;
        console.log('[ws] Connected');
        this.connected = true;
        this.backoff = INITIAL_BACKOFF_MS;
        if (this.store.get('syncEnabled')) this.sendSyncEnable();
        this.emit('statusChange');
        // Announce version so server can detect mismatches
        this.sendRaw({
          type: 'CLIENT_HELLO',
          payload: { clientVersion: CLIENT_VERSION, platform: CLIENT_PLATFORM, directClipboard: true, deviceName: require('os').hostname() } as Record<string, unknown>,
          timestamp: Date.now(),
          deviceId: this.store.get('deviceId'),
        });
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        if (this.ws !== connection) return;
        try {
          const msg = JSON.parse(data.toString()) as WSEnvelope;
          this.handleMessage(msg);
        } catch {
          // ignore
        }
      });

      this.ws.on('close', () => {
        if (this.ws !== connection) return;
        this.connected = false;
        this.ws = null;
        this.emit('statusChange');
        this.scheduleReconnect();
      });

      this.ws.on('error', (err) => {
        console.error('[ws] Error:', err.message);
        connection.terminate();
      });
    } catch (err) {
      console.error('[ws] Connection failed:', err);
      this.scheduleReconnect();
    }
  }

  reconnectNow(): void {
    if (this.refreshing || (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING))) return;
    this.refreshing = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.tryRefreshToken().then(() => {
      if (!this.intentionallyDisconnected) this.connect();
    }).finally(() => { this.refreshing = false; });
  }

  disconnect(): void {
    this.intentionallyDisconnected = true;
    this.clipboardGeneration++;
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
    this.clipboardGeneration++;
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
        this.emit('syncError', '이미지가 5MB를 초과하여 자동 공유하지 못했습니다.');
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

      case 'CLIPBOARD_DELIVERY':
        if (msg.payload?.targetDeviceId === this.store.get('deviceId')) this.emit('directClipboard');
        break;
      case 'CLIPBOARD_UPDATE': {
        if (!this.store.get('syncEnabled')) {
          this.emit('syncError', '복사 내용이 도착했지만 이 기기의 자동 공유가 꺼져 있습니다. 트레이 메뉴에서 켜 주세요.');
          break;
        }
        void this.writeClipboard(msg.payload as any, true).then(written => {
          if (written) this.emit('remoteClipboard', msg.payload);
          else this.emit('syncError', '더 최신의 로컬 복사가 있어 수신 내용을 적용하지 않았습니다.');
        }).catch(err => this.emit('syncError', `클립보드 수신 실패: ${err.message}`));
        break;
      }

      case 'ERROR': {
        const errPayload = msg.payload as { code?: string; message?: string };
        if (errPayload?.code === 'QUOTA_EXCEEDED') {
          this.emit('quotaExceeded');
        } else if (errPayload?.code === 'TOO_LARGE') {
          this.emit('tooLarge', errPayload.message ?? '최대 5MB까지 전송할 수 있습니다.');
        } else {
          this.emit('syncError', errPayload?.message ?? '서버에서 클립보드 공유를 거부했습니다.');
        }
        break;
      }

      case 'CLIPBOARD_ACK': {
        this.emit('clipboardSent');
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
        this.emit('statusChange');
        break;

      case 'SYNC_DISABLE':
        this.emit('statusChange');
        break;

      case 'SHARE_INVITATION': {
        const inv = msg.payload as { fromUsername?: string };
        new Notification({
          title: 'ModuShare – 공유 초대',
          body: `${inv.fromUsername ?? '누군가'}님이 클립보드 공유를 요청했습니다`,
        }).show();
        this.emit('shareInvitation');
        break;
      }

      case 'SHARE_ACCEPTED': {
        const acc = msg.payload as { byUsername?: string };
        new Notification({
          title: 'ModuShare',
          body: `${acc.byUsername ?? '상대방'}님이 공유 초대를 수락했습니다`,
        }).show();
        break;
      }

      case 'VERSION_MISMATCH': {
        if (this.hasShownVersionToast) break;
        this.hasShownVersionToast = true;
        // A peer version is only a hint; verify the published release before notifying.
        void import('./updater').then(updater => updater.checkForUpdates());
        break;
      }

      case 'FILE_TRANSFER': {
        const ft = msg.payload as {
          transferId?: string; fileName?: string; fileSize?: number; mimeType?: string; fileUrl?: string; senderEmail?: string;
        };
        const { BrowserWindow } = require('electron');
        BrowserWindow.getAllWindows().forEach((win: Electron.BrowserWindow) => {
          if (!win.isDestroyed()) {
            win.webContents.send('file:incoming', ft);
          }
        });
        this.emit('fileTransfer', ft);
        break;
      }

      default:
        break;
    }
  }

  async writeClipboard(payload: { contentType?: string; content?: string; imageData?: string; imageUrl?: string }, automatic = false): Promise<boolean> {
    const generation = ++this.clipboardGeneration;
    const previousText = clipboard.readText();
    const previousImage = clipboard.readImage().toPNG();
    let image: Electron.NativeImage | undefined;
    if (payload.contentType === 'image') {
      let buffer: Buffer;
      if (payload.imageData) buffer = Buffer.from(payload.imageData, 'base64');
      else if (payload.imageUrl) {
        const server = new URL(this.store.get('serverUrl'));
        const url = new URL(payload.imageUrl, server);
        if (url.origin !== server.origin || !url.pathname.startsWith('/uploads/')) throw new Error('허용되지 않는 이미지 주소');
        const response = await axios.get(url.href, { responseType: 'arraybuffer', maxContentLength: MAX_INLINE_BYTES,
          headers: { Authorization: `Bearer ${this.store.get('accessToken')}` }, maxRedirects: 0 });
        buffer = Buffer.from(response.data);
      } else return false;
      image = nativeImage.createFromBuffer(buffer);
      if (image.isEmpty()) throw new Error('이미지를 읽을 수 없습니다.');
    } else if (payload.contentType !== 'text' || typeof payload.content !== 'string') return false;
    // An older image download must never overwrite a newer copy.
    if (clipboard.readText() !== previousText || !clipboard.readImage().toPNG().equals(previousImage)) return false;
    if (generation !== this.clipboardGeneration || (automatic && !this.store.get('syncEnabled'))) return false;
    if (image) clipboard.writeImage(image);
    else clipboard.writeText(payload.content!);
    this.poller?.adoptClipboard();
    return true;
  }

  private scheduleReconnect(): void {
    if (this.intentionallyDisconnected || !this.store.get('accessToken') || this.reconnectTimer) return;
    console.log(`[ws] Reconnecting in ${this.backoff}ms…`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      // Try to refresh token before reconnecting
      await this.tryRefreshToken();
      this.connect();
    }, this.backoff);
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
  }

  private async tryRefreshToken(): Promise<void> {
    const serverUrl = this.store.get('serverUrl');
    const refreshToken = this.store.get('refreshToken');
    if (!refreshToken) return;
    try {
      const { data } = await axios.post<{ accessToken: string; refreshToken: string }>(
        `${serverUrl}/auth/refresh`,
        {},
        { headers: { Authorization: `Bearer ${refreshToken}` } }
      );
      if (data.accessToken) {
        this.store.set('accessToken', data.accessToken);
        this.store.set('refreshToken', data.refreshToken ?? refreshToken);
        console.log('[ws] Token refreshed successfully');
      }
    } catch {
      console.log('[ws] Token refresh failed, will retry with existing token');
    }
  }
}
