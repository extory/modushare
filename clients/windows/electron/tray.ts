import { Tray, Menu, shell, app, nativeImage, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import FormData from 'form-data';
import axios from 'axios';
import Store from 'electron-store';
import { AppStore, openLoginWindow } from './main';
import { WSClient } from './wsClient';
import { ClipboardPoller } from './clipboardPoller';

let flashTimer: ReturnType<typeof setInterval> | null = null;
let flashCount = 0;

export function createTray(
  store: Store<AppStore>,
  wsClient: WSClient,
  poller: ClipboardPoller
): Tray {
  const iconNormal  = path.join(__dirname, '../../assets/tray-icon.png');
  const iconAlert   = path.join(__dirname, '../../assets/tray-icon-alert.png');

  // alert 아이콘이 없으면 normal 아이콘 사용 (빌드 환경 대비)
  const alertExists = require('fs').existsSync(iconAlert);

  const tray = new Tray(iconNormal);

  // ── 신규 복사 알림 이펙트 ─────────────────────────────────────────────────
  function startFlash(): void {
    if (flashTimer) return; // 이미 깜빡이는 중이면 무시
    flashCount = 0;
    let toggle = false;
    flashTimer = setInterval(() => {
      toggle = !toggle;
      tray.setImage(
        toggle && alertExists ? iconAlert : iconNormal
      );
      flashCount++;
      if (flashCount >= 10) { // 5회 깜빡임 후 정지
        stopFlash();
      }
    }, 400);
  }

  function stopFlash(): void {
    if (flashTimer) {
      clearInterval(flashTimer);
      flashTimer = null;
    }
    tray.setImage(iconNormal);
  }

  // WSClient에서 신규 원격 복사 이벤트 수신
  wsClient.on('remoteClipboard', () => {
    startFlash();
  });

  wsClient.on('fileTransfer', (ft: { fileName?: string; fileSize?: number; fileUrl?: string; senderEmail?: string }) => {
    const sizeKB = ft.fileSize ? Math.round(ft.fileSize / 1024) : 0;
    tray.displayBalloon({
      title: 'ModuShare – 파일 수신',
      content: `${ft.senderEmail ?? '상대방'}이(가) "${ft.fileName ?? '파일'}" (${sizeKB}KB)을 보냈습니다. 클릭하여 저장`,
      iconType: 'info',
    });
    tray.once('balloon-click', async () => {
      if (!ft.fileUrl || !ft.fileName) return;
      const { ipcMain } = require('electron');
      // Send download request via IPC to main process handler
      const { BrowserWindow } = require('electron');
      const wins = BrowserWindow.getAllWindows();
      if (wins.length > 0) {
        wins[0].webContents.send('file:download-request', { fileUrl: ft.fileUrl, fileName: ft.fileName });
      }
    });
  });

  wsClient.on('quotaExceeded', () => {
    tray.displayBalloon({
      title: 'ModuShare',
      content: '저장 용량(20MB)을 초과했습니다. 기존 항목이 정리된 후 다시 시도해주세요.',
      iconType: 'warning',
    });
  });

  wsClient.on('versionMismatch', (downloadUrl: string) => {
    tray.displayBalloon({
      title: 'ModuShare – 업데이트 권장',
      content: '연결된 기기가 더 최신 버전을 사용 중입니다. 클릭하여 최신 버전을 다운로드하세요.',
      iconType: 'info',
    });
    tray.once('balloon-click', () => {
      shell.openExternal(downloadUrl);
    });
  });

  const updateMenu = () => {
    const syncEnabled = store.get('syncEnabled');
    const isConnected = wsClient.isConnected();

    tray.setToolTip(
      `ModuShare – ${isConnected ? 'Connected' : 'Disconnected'} | Sync: ${syncEnabled ? 'ON' : 'OFF'}`
    );

    const userEmail = store.get('userEmail');
    const accountLabel = userEmail ? userEmail : 'Sign In / Account';

    const menu = Menu.buildFromTemplate([
      {
        label: 'ModuShare',
        enabled: false,
      },
      {
        label: store.get('accessToken') ? (userEmail ? `계정: ${userEmail}` : '로그인됨') : '로그인 안됨',
        enabled: false,
      },
      { type: 'separator' },
      {
        label: syncEnabled ? 'Disable Sync' : 'Enable Sync',
        click: () => {
          const newVal = !store.get('syncEnabled');
          store.set('syncEnabled', newVal);
          if (newVal) {
            wsClient.sendSyncEnable();
            poller.start();
          } else {
            wsClient.sendSyncDisable();
            poller.stop();
          }
          updateMenu();
        },
      },
      {
        label: 'View History in Browser',
        click: () => {
          const serverUrl = store.get('serverUrl');
          shell.openExternal(serverUrl);
        },
      },
      {
        label: '파일 보내기…',
        click: () => sendFile(store),
      },
      {
        label: '공유 관리…',
        click: () => openShareWindow(),
      },
      {
        label: 'Preferences…',
        click: () => openPreferencesWindow(),
      },
      { type: 'separator' },
      {
        label: isConnected ? 'Connected' : 'Reconnecting…',
        enabled: false,
      },
      { type: 'separator' },
      ...(store.get('accessToken')
        ? [
            {
              label: 'Sign Out',
              click: async () => {
                const { ipcMain } = require('electron');
                const serverUrl = store.get('serverUrl');
                const token = store.get('accessToken');
                try {
                  const axios = require('axios');
                  await axios.post(`${serverUrl}/auth/logout`, {}, { headers: { Authorization: `Bearer ${token}` } });
                } catch {}
                store.set('accessToken', '');
                store.set('userEmail', '');
                wsClient.disconnect();
                poller.stop();
                updateMenu();
              },
            },
          ]
        : [
            {
              label: 'Sign In…',
              click: () => openLoginWindow(),
            },
          ]),
      { type: 'separator' },
      {
        label: 'Quit ModuShare',
        click: () => app.quit(),
      },
    ]);

    tray.setContextMenu(menu);
  };

  updateMenu();
  wsClient.on('statusChange', updateMenu);
  wsClient.on('shareInvitation', () => {
    // 공유 관리 창이 열려있으면 알림 전송
    const { BrowserWindow } = require('electron');
    BrowserWindow.getAllWindows().forEach((win: Electron.BrowserWindow) => {
      if (!win.isDestroyed()) win.webContents.send('share:newInvitation');
    });
  });

  return tray;
}

async function sendFile(store: Store<AppStore>): Promise<void> {
  const serverUrl = store.get('serverUrl');
  const token = store.get('accessToken');
  const result = await dialog.showOpenDialog({ title: '파일 선택 (최대 5MB)', properties: ['openFile'] });
  if (result.canceled || result.filePaths.length === 0) return;
  const filePath = result.filePaths[0]!;
  const stat = fs.statSync(filePath);
  if (stat.size > 5 * 1024 * 1024) {
    dialog.showErrorBox('파일 크기 초과', '5MB 이하의 파일만 전송할 수 있습니다.');
    return;
  }
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), path.basename(filePath));
    await axios.post(`${serverUrl}/files/send`, form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${token}` },
    });
  } catch {
    dialog.showErrorBox('전송 실패', '파일 전송에 실패했습니다.');
  }
}

function openShareWindow(): void {
  const { BrowserWindow } = require('electron');
  const path = require('path');
  const win = new BrowserWindow({
    width: 480,
    height: 500,
    resizable: false,
    title: 'ModuShare – 공유 관리',
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  win.loadFile(path.join(__dirname, '../../renderer/share.html'));
}

function openPreferencesWindow(): void {
  const { BrowserWindow } = require('electron');
  const path = require('path');
  const win = new BrowserWindow({
    width: 460,
    height: 360,
    resizable: false,
    title: 'ModuShare – Preferences',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  win.loadFile(path.join(__dirname, '../../renderer/preferences.html'));
}
