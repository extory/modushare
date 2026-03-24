import { clipboard } from 'electron';
import { EventEmitter } from 'events';
import crypto from 'crypto';
import Store from 'electron-store';
import { AppStore } from './main';
import { WSClient } from './wsClient';

const POLL_INTERVAL_MS = 500;

export interface ClipboardChangedEvent {
  type: 'text' | 'image';
  text?: string;
  imageBase64?: string;
  imageSize?: number;
}

function hashBuffer(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export class ClipboardPoller extends EventEmitter {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastText = '';
  private lastImageHash = '';
  // Set by WSClient when it writes to clipboard to prevent echo
  public lastReceivedHash = '';

  constructor(
    private readonly wsClient: WSClient,
    private readonly store: Store<AppStore>
  ) {
    super();
  }

  start(): void {
    if (this.timer) return;
    // Seed current state so first poll doesn't fire spuriously
    this.lastText = clipboard.readText();
    const img = clipboard.readImage();
    this.lastImageHash = img.isEmpty()
      ? ''
      : hashBuffer(img.toPNG());

    this.timer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private poll(): void {
    if (!this.store.get('syncEnabled')) return;

    const currentText = clipboard.readText();
    const img = clipboard.readImage();
    const currentImageHash = img.isEmpty() ? '' : hashBuffer(img.toPNG());

    // ── Text changed ──────────────────────────────────────────────────────────
    if (currentText && currentText !== this.lastText) {
      this.lastText = currentText;
      const textHash = hashBuffer(Buffer.from(currentText, 'utf-8'));
      if (textHash === this.lastReceivedHash) return; // echo prevention
      this.lastReceivedHash = '';

      // Auto-reconnect if disconnected
      if (!this.wsClient.isConnected()) {
        this.wsClient.reconnectNow();
        return;
      }

      this.wsClient.sendClipboardUpdate({
        type: 'text',
        text: currentText,
      });
      return;
    }

    // ── Image changed ─────────────────────────────────────────────────────────
    if (!img.isEmpty() && currentImageHash !== this.lastImageHash) {
      this.lastImageHash = currentImageHash;
      if (currentImageHash === this.lastReceivedHash) {
        this.lastReceivedHash = '';
        return; // echo prevention
      }

      const pngBuffer = img.toPNG();
      const base64 = pngBuffer.toString('base64');
      this.wsClient.sendClipboardUpdate({
        type: 'image',
        imageBase64: base64,
        imageSize: pngBuffer.length,
      });
    }
  }
}
