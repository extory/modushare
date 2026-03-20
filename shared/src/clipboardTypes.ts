export type ClipboardContentType = 'text' | 'image';

export interface ClipboardTextContent {
  contentType: 'text';
  text: string;
}

export interface ClipboardImageContent {
  contentType: 'image';
  // base64-encoded PNG data (for inline images < 512 KB)
  imageData?: string;
  // relative URL returned by the upload endpoint (for large images)
  imageUrl?: string;
}

export type ClipboardContent = ClipboardTextContent | ClipboardImageContent;

export interface ClipboardItem {
  id: string;
  userId: string;
  deviceId: string;
  contentType: ClipboardContentType;
  contentText?: string;
  imagePath?: string;
  createdAt: number; // Unix ms timestamp
  isDeleted: boolean;
}

export interface User {
  id: string;
  username: string;
  email: string;
  syncEnabled: boolean;
  createdAt: number;
}
