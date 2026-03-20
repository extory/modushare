import { apiClient, setAccessToken } from './client';
import { LoginResponse, HistoryResponse } from '../types';

export const endpoints = {
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
};
