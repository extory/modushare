import { ipcMain, BrowserWindow, session, dialog, shell } from 'electron';
import axios from 'axios';
import http from 'http';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
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
  refreshToken: string;
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
        store.set('refreshToken', data.refreshToken ?? '');
        store.set('userEmail', data.user.email);

        // Connect WS and start polling after successful login
        wsClient.connect();
        poller.start();
        wsClient.emit('statusChange');

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
      const fixedPort = 9842;
      localServer.listen(fixedPort, '127.0.0.1', () => {
        const port = fixedPort;
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

        let resolved = false;

        const cleanup = () => {
          try { localServer.close(); } catch {}
          if (!authWin.isDestroyed()) authWin.destroy();
        };

        authWin.on('closed', () => {
          try { localServer.close(); } catch {}
          if (!resolved) {
            resolved = true;
            resolve({ ok: false, error: '로그인이 취소됐습니다.' });
          }
        });

        // 4. redirect_uri로 code 수신
        localServer.on('request', async (req, res) => {
          const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<html><body><p>로그인 완료. 이 창을 닫아도 됩니다.</p><script>window.close()</script></body></html>');

          if (!code || error) {
            resolved = true;
            cleanup();
            resolve({ ok: false, error: error ?? '인증 코드를 받지 못했습니다.' });
            return;
          }

          // 5. code → ID token (서버에 code + redirectUri 전달)
          try {
            const { data } = await axios.post<LoginResponse>(
              `${serverUrl}/auth/google`,
              { code, redirectUri }
            );
            store.set('accessToken', data.accessToken);
            store.set('refreshToken', data.refreshToken ?? '');
            store.set('userEmail', data.user.email);
            resolved = true;
            cleanup();
            // 로그인 창 닫기 (main process에서 처리)
            const loginWin = getLoginWindow();
            if (loginWin && !loginWin.isDestroyed()) loginWin.close();
            wsClient.connect();
            poller.start();
            wsClient.emit('statusChange');
            resolve({ ok: true, user: data.user });
          } catch (err: unknown) {
            const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Google 로그인 실패';
            resolved = true;
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
    autoUpdate: store.get('autoUpdate'),
  }));

  // ── Save settings ──────────────────────────────────────────────────────────
  ipcMain.handle(
    'settings:set',
    (_event, settings: { serverUrl?: string; syncEnabled?: boolean; autoUpdate?: boolean }) => {
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
      if (settings.autoUpdate !== undefined) {
        store.set('autoUpdate', settings.autoUpdate);
      }
      return { ok: true };
    }
  );

  // ── Check for updates manually ─────────────────────────────────────────────
  ipcMain.handle('updater:check', async () => {
    try {
      const { autoUpdater } = require('electron-updater');
      const result = await autoUpdater.checkForUpdates();
      return { ok: true, updateInfo: result?.updateInfo ?? null };
    } catch (err: unknown) {
      return { ok: false, error: (err as Error).message };
    }
  });

  // ── Install downloaded update now ──────────────────────────────────────────
  ipcMain.handle('updater:install', () => {
    try {
      const { autoUpdater } = require('electron-updater');
      autoUpdater.quitAndInstall(false, true);
    } catch {
      // ignore
    }
  });

  // ── App version ────────────────────────────────────────────────────────────
  ipcMain.handle('app:version', () => {
    const { app } = require('electron');
    return app.getVersion();
  });

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

  // ── Dialog: confirm ────────────────────────────────────────────────────────
  ipcMain.handle('dialog:confirm', async (_event, message: string) => {
    const result = await dialog.showMessageBox({
      type: 'question',
      buttons: ['보내기', '취소'],
      defaultId: 0,
      cancelId: 1,
      message: '미가입 이메일',
      detail: message,
    });
    return result.response === 0;
  });

  // ── Share: email invite (non-member) ───────────────────────────────────────
  ipcMain.handle('share:emailInvite', async (_event, email: string) => {
    const serverUrl = store.get('serverUrl');
    const token = store.get('accessToken');
    try {
      const { data } = await axios.post(
        `${serverUrl}/share/email-invite`,
        { email },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return { ok: true, ...data };
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? '초대 이메일 전송 실패';
      return { ok: false, error: message };
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

  // ── Share: invite ──────────────────────────────────────────────────────────
  ipcMain.handle('share:invite', async (_event, email: string) => {
    const serverUrl = store.get('serverUrl');
    const token = store.get('accessToken');
    try {
      const { data } = await axios.post(
        `${serverUrl}/share/invite`,
        { email },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return { ok: true, ...data };
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? '초대 실패';
      if (status === 404) return { ok: false, notMember: true, error: message };
      return { ok: false, error: message };
    }
  });

  // ── Share: history (sent + received) ──────────────────────────────────────
  ipcMain.handle('share:history', async () => {
    const serverUrl = store.get('serverUrl');
    const token = store.get('accessToken');
    try {
      const { data } = await axios.get(`${serverUrl}/share/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { ok: true, sent: data.sent, received: data.received };
    } catch {
      return { ok: false, sent: [], received: [] };
    }
  });

  // ── Share: invitations list ────────────────────────────────────────────────
  ipcMain.handle('share:invitations', async () => {
    const serverUrl = store.get('serverUrl');
    const token = store.get('accessToken');
    try {
      const { data } = await axios.get(`${serverUrl}/share/invitations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { ok: true, invitations: data.invitations };
    } catch {
      return { ok: false, invitations: [] };
    }
  });

  // ── Share: accept ──────────────────────────────────────────────────────────
  ipcMain.handle('share:accept', async (_event, invId: string) => {
    const serverUrl = store.get('serverUrl');
    const token = store.get('accessToken');
    try {
      await axios.post(`${serverUrl}/share/invitations/${invId}/accept`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  // ── Share: reject ──────────────────────────────────────────────────────────
  ipcMain.handle('share:reject', async (_event, invId: string) => {
    const serverUrl = store.get('serverUrl');
    const token = store.get('accessToken');
    try {
      await axios.post(`${serverUrl}/share/invitations/${invId}/reject`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  // ── File: send ─────────────────────────────────────────────────────────────
  ipcMain.handle('file:send', async () => {
    const serverUrl = store.get('serverUrl');
    const token = store.get('accessToken');
    const result = await dialog.showOpenDialog({
      title: '파일 선택 (최대 5MB)',
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { ok: false };
    const filePath = result.filePaths[0]!;
    const stat = fs.statSync(filePath);
    if (stat.size > 5 * 1024 * 1024) {
      return { ok: false, error: '파일 크기가 5MB를 초과합니다.' };
    }
    try {
      const form = new FormData();
      form.append('file', fs.createReadStream(filePath), path.basename(filePath));
      const { data } = await axios.post(`${serverUrl}/files/send`, form, {
        headers: { ...form.getHeaders(), Authorization: `Bearer ${token}` },
      });
      return { ok: true, ...data };
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? '파일 전송 실패';
      return { ok: false, error: message };
    }
  });

  // ── File: download ──────────────────────────────────────────────────────────
  ipcMain.handle('file:download', async (_event, { fileUrl, fileName }: { fileUrl: string; fileName: string }) => {
    const token = store.get('accessToken');
    const result = await dialog.showSaveDialog({
      defaultPath: fileName,
      title: '파일 저장',
    });
    if (result.canceled || !result.filePath) return { ok: false };
    try {
      const { data } = await axios.get(fileUrl, {
        responseType: 'arraybuffer',
        headers: { Authorization: `Bearer ${token}` },
      });
      fs.writeFileSync(result.filePath, Buffer.from(data as ArrayBuffer));
      shell.showItemInFolder(result.filePath);
      return { ok: true };
    } catch {
      return { ok: false, error: '다운로드 실패' };
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
    store.set('userEmail', '');
    wsClient.disconnect();
    poller.stop();
    return { ok: true };
  });
}
