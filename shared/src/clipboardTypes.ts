export type ClipboardContentType = 'text' | 'image' | 'file';

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

export interface ClipboardFileContent {
  contentType: 'file';
  fileUrl: string;
  fileName: string;
  fileSize: number;
}

export type ClipboardContent = ClipboardTextContent | ClipboardImageContent | ClipboardFileContent;

export interface ClipboardItem {
  id: string;
  userId: string;
  deviceId: string;
  contentType: ClipboardContentType;
  contentText?: string;
  imagePath?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
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
