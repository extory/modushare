import { ipcMain, BrowserWindow } from 'electron';
import axios from 'axios';
import Store from 'electron-store';
import { AppStore, getLoginWindow } from './main';
import { WSClient } from './wsClient';
import { ClipboardPoller } from './clipboardPoller';

interface LoginPayload {
  email: string;
  password: string;
}

interface LoginResponse {
  accessToken: string;
  user: { id: string; username: string; email: string; syncEnabled: boolean };
}

export function setupIpcHandlers(
  wsClient: WSClient,
  poller: ClipboardPoller,
  store: Store<AppStore>
): void {
  // ── Login ──────────────────────────────────────────────────────────────────
  ipcMain.handle(
    'auth:login',
    async (_event, { email, password }: LoginPayload) => {
      const serverUrl = store.get('serverUrl');
      try {
        const { data } = await axios.post<LoginResponse>(
          `${serverUrl}/auth/login`,
          { email, password }
        );
        store.set('accessToken', data.accessToken);

        // Connect WS and start polling after successful login
        wsClient.connect();
        poller.start();

        // Close login window
        const loginWin = getLoginWindow();
        if (loginWin && !loginWin.isDestroyed()) loginWin.close();

        return { ok: true, user: data.user };
      } catch (err: unknown) {
        const message =
          (err as { response?: { data?: { error?: string } } })?.response?.data
            ?.error ?? 'Login failed';
        return { ok: false, error: message };
      }
    }
  );

  // ── Get settings ───────────────────────────────────────────────────────────
  ipcMain.handle('settings:get', () => ({
    serverUrl: store.get('serverUrl'),
    syncEnabled: store.get('syncEnabled'),
  }));

  // ── Save settings ──────────────────────────────────────────────────────────
  ipcMain.handle(
    'settings:set',
    (_event, settings: { serverUrl?: string; syncEnabled?: boolean }) => {
      if (settings.serverUrl !== undefined) {
        store.set('serverUrl', settings.serverUrl);
        // Reconnect with new URL
        wsClient.disconnect();
        wsClient.connect();
      }
      if (settings.syncEnabled !== undefined) {
        store.set('syncEnabled', settings.syncEnabled);
        if (settings.syncEnabled) {
          wsClient.sendSyncEnable();
          poller.start();
        } else {
          wsClient.sendSyncDisable();
          poller.stop();
        }
      }
      return { ok: true };
    }
  );

  // ── Share: list ────────────────────────────────────────────────────────────
  ipcMain.handle('share:list', async () => {
    const serverUrl = store.get('serverUrl');
    const token = store.get('accessToken');
    try {
      const { data } = await axios.get(`${serverUrl}/share`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { ok: true, partners: data.partners };
    } catch {
      return { ok: false, partners: [] };
    }
  });

  // ── Share: add ─────────────────────────────────────────────────────────────
  ipcMain.handle('share:add', async (_event, email: string) => {
    const serverUrl = store.get('serverUrl');
    const token = store.get('accessToken');
    try {
      const { data } = await axios.post(
        `${serverUrl}/share`,
        { email },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return { ok: true, partner: data };
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? '추가 실패';
      return { ok: false, error: message };
    }
  });

  // ── Share: remove ──────────────────────────────────────────────────────────
  ipcMain.handle('share:remove', async (_event, targetId: string) => {
    const serverUrl = store.get('serverUrl');
    const token = store.get('accessToken');
    try {
      await axios.delete(`${serverUrl}/share/${targetId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  // ── Logout ─────────────────────────────────────────────────────────────────
  ipcMain.handle('auth:logout', async () => {
    const serverUrl = store.get('serverUrl');
    const token = store.get('accessToken');
    try {
      await axios.post(
        `${serverUrl}/auth/logout`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch {
      // best-effort
    }
    store.set('accessToken', '');
    wsClient.disconnect();
    poller.stop();
    return { ok: true };
  });
}
