import axios from 'axios';
import { apiClient, setAccessToken, BASE_URL } from './client';
import { LoginResponse, HistoryResponse, SharePartner, ShareInvitation, AdminUser, AdminStats, AdminStorageUser } from '../types';

export const endpoints = {
  async refresh(): Promise<LoginResponse | null> {
    try {
      const { data: refreshData } = await axios.post<{ accessToken: string }>(
        `${BASE_URL}/auth/refresh`,
        {},
        { withCredentials: true }
      );
      setAccessToken(refreshData.accessToken);
      // fetch user info with new token
      const { data: meData } = await axios.get<LoginResponse['user']>(
        `${BASE_URL}/auth/me`,
        { headers: { Authorization: `Bearer ${refreshData.accessToken}` }, withCredentials: true }
      );
      return { accessToken: refreshData.accessToken, user: meData };
    } catch {
      return null;
    }
  },

  async login(email: string, password: string): Promise<LoginResponse> {
    const { data } = await apiClient.post<LoginResponse>('/auth/login', {
      email,
      password,
    });
    setAccessToken(data.accessToken);
    return data;
  },

  async register(
    username: string,
    email: string,
    password: string
  ): Promise<LoginResponse> {
    const { data } = await apiClient.post<LoginResponse>('/auth/register', {
      username,
      email,
      password,
    });
    setAccessToken(data.accessToken);
    return data;
  },

  async googleLogin(credential: string): Promise<LoginResponse> {
    const { data } = await apiClient.post<LoginResponse>('/auth/google', { credential });
    setAccessToken(data.accessToken);
    return data;
  },

  async logout(): Promise<void> {
    await apiClient.post('/auth/logout');
    setAccessToken(null);
  },

  async getHistory(
    limit = 50,
    offset = 0
  ): Promise<HistoryResponse> {
    const { data } = await apiClient.get<HistoryResponse>(
      `/clipboard/history?limit=${limit}&offset=${offset}`
    );
    return data;
  },

  async deleteItem(id: string): Promise<void> {
    await apiClient.delete(`/clipboard/${id}`);
  },

  async getSharePartners(): Promise<{ partners: SharePartner[] }> {
    const { data } = await apiClient.get<{ partners: SharePartner[] }>('/share');
    return data;
  },

  async removeSharePartner(targetId: string): Promise<void> {
    await apiClient.delete(`/share/${targetId}`);
  },

  async sendShareInvitation(email: string): Promise<{ ok: boolean; toEmail: string; toUsername: string }> {
    const { data } = await apiClient.post('/share/invite', { email });
    return data;
  },

  async getShareInvitations(): Promise<{ invitations: ShareInvitation[] }> {
    const { data } = await apiClient.get<{ invitations: ShareInvitation[] }>('/share/invitations');
    return data;
  },

  async acceptInvitation(id: string): Promise<void> {
    await apiClient.post(`/share/invitations/${id}/accept`);
  },

  async rejectInvitation(id: string): Promise<void> {
    await apiClient.post(`/share/invitations/${id}/reject`);
  },

  async adminGetUsers(): Promise<{ users: AdminUser[] }> {
    const { data } = await apiClient.get('/admin/users');
    return data;
  },

  async adminGetStats(): Promise<AdminStats> {
    const { data } = await apiClient.get('/admin/stats');
    return data;
  },

  async adminGetStorage(): Promise<{ users: AdminStorageUser[] }> {
    const { data } = await apiClient.get('/admin/storage');
    return data;
  },

  async uploadImage(blob: Blob): Promise<{ imageUrl: string }> {
    const formData = new FormData();
    formData.append('image', blob, 'clipboard.png');
    const { data } = await apiClient.post<{ imageUrl: string }>(
      '/upload/image',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return data;
  },

  async uploadFile(file: File): Promise<{ fileUrl: string; fileName: string; fileSize: number }> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    const { data } = await apiClient.post<{ fileUrl: string; fileName: string; fileSize: number }>(
      '/upload/file',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return data;
  },
};
