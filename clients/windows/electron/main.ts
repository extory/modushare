import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { createTray } from './tray';
import { ClipboardPoller } from './clipboardPoller';
import { WSClient } from './wsClient';
import { setupIpcHandlers } from './ipcHandlers';
import Store from 'electron-store';

export interface AppStore {
  serverUrl: string;
  accessToken: string;
  refreshToken: string;
  syncEnabled: boolean;
  deviceId: string;
}

// ─── Electron store ───────────────────────────────────────────────────────────
export const store = new Store<AppStore>({
  defaults: {
    serverUrl: 'http://localhost:3010',
    accessToken: '',
    refreshToken: '',
    syncEnabled: true,
    deviceId: require('uuid').v4(),
  },
});

let mainWindow: BrowserWindow | null = null;
let loginWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function getLoginWindow(): BrowserWindow | null {
  return loginWindow;
}

// ─── App entry ───────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Hidden main window (hosts app logic, no visible UI)
  mainWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const wsClient = new WSClient(store);
  const poller = new ClipboardPoller(wsClient, store);

  setupIpcHandlers(wsClient, poller, store);
  createTray(store, wsClient, poller);

  // If not authenticated, open login window
  if (!store.get('accessToken')) {
    openLoginWindow();
  } else {
    wsClient.connect();
    poller.start();
  }
});

export function openLoginWindow(): void {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus();
    return;
  }
  loginWindow = new BrowserWindow({
    width: 420,
    height: 520,
    resizable: false,
    title: 'ModuShare – Sign In',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  loginWindow.loadFile(path.join(__dirname, '../../renderer/login.html'));
  loginWindow.on('closed', () => { loginWindow = null; });
}

app.on('window-all-closed', () => {
  // Keep app running as tray app (don't quit on window close)
});
