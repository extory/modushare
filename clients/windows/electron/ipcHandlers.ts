import { ipcMain, BrowserWindow, session } from 'electron';
import axios from 'axios';
import http from 'http';
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

  // ── Google Login ───────────────────────────────────────────────────────────
  ipcMain.handle('auth:google', async () => {
    const serverUrl = store.get('serverUrl');

    // 1. 서버에서 Google Client ID 가져오기
    let googleClientId: string;
    try {
      const { data } = await axios.get<{ googleClientId: string }>(`${serverUrl}/auth/google-client-id`);
      googleClientId = data.googleClientId;
      if (!googleClientId) return { ok: false, error: 'Google 로그인이 서버에서 설정되지 않았습니다.' };
    } catch {
      return { ok: false, error: '서버에 연결할 수 없습니다.' };
    }

    // 2. 임시 로컬 HTTP 서버로 redirect_uri 처리
    return new Promise((resolve) => {
      const localServer = http.createServer();
      localServer.listen(0, '127.0.0.1', () => {
        const port = (localServer.address() as { port: number }).port;
        const redirectUri = `http://127.0.0.1:${port}`;

        const authUrl =
          `https://accounts.google.com/o/oauth2/v2/auth` +
          `?client_id=${encodeURIComponent(googleClientId)}` +
          `&redirect_uri=${encodeURIComponent(redirectUri)}` +
          `&response_type=code` +
          `&scope=${encodeURIComponent('openid email profile')}` +
          `&access_type=offline` +
          `&prompt=select_account`;

        // 3. Google 인증 팝업 창
        const authWin = new BrowserWindow({
          width: 500,
          height: 650,
          title: 'ModuShare – Google 로그인',
          webPreferences: { nodeIntegration: false, contextIsolation: true },
        });
        authWin.loadURL(authUrl);

        const cleanup = () => {
          localServer.close();
          if (!authWin.isDestroyed()) authWin.close();
        };

        authWin.on('closed', () => {
          localServer.close();
          resolve({ ok: false, error: '로그인이 취소됐습니다.' });
        });

        // 4. redirect_uri로 code 수신
        localServer.on('request', async (req, res) => {
          const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<html><body><p>로그인 완료. 이 창을 닫아도 됩니다.</p><script>window.close()</script></body></html>');

          if (!code || error) {
            cleanup();
            resolve({ ok: false, error: error ?? '인증 코드를 받지 못했습니다.' });
            return;
          }

          // 5. code → ID token (서버에 code + redirectUri 전달)
          try {
            const { data } = await axios.post<{ accessToken: string; user: LoginResponse['user'] }>(
              `${serverUrl}/auth/google`,
              { code, redirectUri }
            );
            store.set('accessToken', data.accessToken);
            wsClient.connect();
            poller.start();
            const loginWin = getLoginWindow();
            if (loginWin && !loginWin.isDestroyed()) loginWin.close();
            cleanup();
            resolve({ ok: true, user: data.user });
          } catch (err: unknown) {
            const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Google 로그인 실패';
            cleanup();
            resolve({ ok: false, error: msg });
          }
        });
      });
    });
  });

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
