import { Tray, Menu, shell, app } from 'electron';
import path from 'path';
import Store from 'electron-store';
import { AppStore, openLoginWindow } from './main';
import { WSClient } from './wsClient';
import { ClipboardPoller } from './clipboardPoller';

export function createTray(
  store: Store<AppStore>,
  wsClient: WSClient,
  poller: ClipboardPoller
): Tray {
  // Fallback icon path – replace with your actual .ico asset
  const iconPath = path.join(__dirname, '../../assets/tray-icon.png');
  const tray = new Tray(iconPath);

  const updateMenu = () => {
    const syncEnabled = store.get('syncEnabled');
    const isConnected = wsClient.isConnected();

    tray.setToolTip(
      `ModuShare – ${isConnected ? 'Connected' : 'Disconnected'} | Sync: ${syncEnabled ? 'ON' : 'OFF'}`
    );

    const menu = Menu.buildFromTemplate([
      {
        label: 'ModuShare',
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
        label: 'Preferences…',
        click: () => openPreferencesWindow(),
      },
      { type: 'separator' },
      {
        label: isConnected ? 'Connected' : 'Reconnecting…',
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Sign In / Account',
        click: () => openLoginWindow(),
      },
      { type: 'separator' },
      {
        label: 'Quit ModuShare',
        click: () => app.quit(),
      },
    ]);

    tray.setContextMenu(menu);
  };

  updateMenu();

  // Refresh menu when connection state changes
  wsClient.on('statusChange', updateMenu);

  return tray;
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
