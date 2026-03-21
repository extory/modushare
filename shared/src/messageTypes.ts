import { ClipboardContentType } from './clipboardTypes';

// ─── Outbound payload types ──────────────────────────────────────────────────

export interface ClipboardUpdatePayload {
  contentType: ClipboardContentType;
  /** Plain text content (when contentType === 'text') */
  content?: string;
  /** Inline base64 PNG (images < 512 KB) */
  imageData?: string;
  /** URL returned by the upload endpoint (images >= 512 KB) */
  imageUrl?: string;
  /** Populated by server on broadcast so clients can cache the DB id */
  itemId?: string;
}

export interface SyncTogglePayload {
  enabled: boolean;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export interface AckPayload {
  itemId: string;
}

export interface ClientHelloPayload {
  /** Semantic version string, e.g. "1.2.0" */
  clientVersion: string;
  /** 'windows' | 'macos' | 'web' */
  platform: string;
}

export interface VersionMismatchPayload {
  myVersion: string;
  peerVersion: string;
  downloadUrl: string;
}

// ─── Message type discriminator ──────────────────────────────────────────────

export type WSMessageType =
  | 'CLIPBOARD_UPDATE'
  | 'SYNC_ENABLE'
  | 'SYNC_DISABLE'
  | 'PING'
  | 'PONG'
  | 'ERROR'
  | 'CLIPBOARD_ACK'
  | 'SHARE_INVITATION'
  | 'SHARE_ACCEPTED'
  | 'CLIENT_HELLO'
  | 'VERSION_MISMATCH';

// ─── Generic envelope ────────────────────────────────────────────────────────

export interface WSMessage<T = unknown> {
  type: WSMessageType;
  payload?: T;
  timestamp: number;
  deviceId: string;
}

// ─── Typed helpers ───────────────────────────────────────────────────────────

export type ClipboardUpdateMessage = WSMessage<ClipboardUpdatePayload>;
export type SyncToggleMessage = WSMessage<SyncTogglePayload>;
export type ErrorMessage = WSMessage<ErrorPayload>;
export type AckMessage = WSMessage<AckPayload>;
export type PingMessage = WSMessage<never>;
export type PongMessage = WSMessage<never>;
