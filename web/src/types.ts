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
  role?: string;
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

export interface SharePartner {
  id: string;
  userId: string;
  username: string;
  email: string;
}

export interface ShareInvitation {
  id: string;
  fromId: string;
  fromUsername: string;
  fromEmail: string;
  createdAt: number;
}

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  created_at: number;
  login_method: string;
  item_count: number;
  text_bytes: number;
}

export interface AdminStats {
  shares: { daily: number; weekly: number; monthly: number; total: number };
  clipboard: { daily: number; weekly: number; monthly: number; total: number };
  storage: { total_bytes: number };
  users: { total: number; google: number; email: number };
}

export interface AdminStorageUser {
  id: string;
  email: string;
  username: string;
  text_bytes: number;
  item_count: number;
}
