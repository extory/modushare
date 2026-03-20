export interface ClipboardItem {
  id: string;
  userId: string;
  deviceId: string;
  contentType: 'text' | 'image';
  contentText?: string;
  imagePath?: string;
  imageUrl?: string;
  createdAt: number;
  isDeleted: boolean;
}

export interface User {
  id: string;
  username: string;
  email: string;
  syncEnabled: boolean;
  avatarUrl?: string;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
}

export interface HistoryResponse {
  items: ClipboardItem[];
  limit: number;
  offset: number;
}
