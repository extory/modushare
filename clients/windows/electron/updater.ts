import { EventEmitter } from 'events';
import { autoUpdater } from 'electron-updater';
import { app, BrowserWindow, Notification, shell } from 'electron';
import axios from 'axios';
import Store from 'electron-store';
import { AppStore } from './main';

export type UpdateStatus = 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'downloaded' | 'manual' | 'error';
export interface UpdateState { status: UpdateStatus; currentVersion: string; latestVersion?: string; percent?: number; error?: string }
export const updateEvents = new EventEmitter();
let state: UpdateState;
let checking: Promise<UpdateState> | null = null;
let installerUrl: string | undefined;
let settings: Store<AppStore>;
const notified = new Set<string>();
export function isNewerVersion(latest: string, current: string): boolean {
  if (!/^v?\d+\.\d+\.\d+$/.test(latest) || !/^v?\d+\.\d+\.\d+$/.test(current)) return false;
  const a = latest.replace(/^v/, '').split('.').map(Number), b = current.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i]! > b[i]!; }
  return false;
}
export function getUpdateState(): UpdateState { return state ?? { status: 'idle', currentVersion: app.getVersion() }; }
function publish(next: Partial<UpdateState>): UpdateState {
  state = { ...getUpdateState(), ...next };
  updateEvents.emit('change', state);
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('updater:state', state);
  return state;
}
function available(version: string): void {
  if (!isNewerVersion(version, app.getVersion())) { publish({ status: 'current', latestVersion: version }); return; }
  publish({ status: 'available', latestVersion: version });
  if (!notified.has(version)) {
    notified.add(version);
    const notification = new Notification({ title: 'ModuShare – 업데이트 가능', body: `v${version}을 다운로드하려면 클릭하세요.` });
    notification.on('click', () => { void downloadUpdate(); });
    notification.show();
  }
  // Unsigned macOS DMGs are installed manually; never claim automatic installation.
  if (process.platform === 'win32' && settings?.get('autoUpdate')) void downloadUpdate();
}
export function checkForUpdates(): Promise<UpdateState> {
  if (checking) return checking;
  if (['downloading', 'downloaded'].includes(getUpdateState().status)) return Promise.resolve(getUpdateState());
  if (!app.isPackaged) return Promise.resolve(publish({ status: 'error', error: '설치된 앱에서 업데이트를 확인할 수 있습니다.' }));
  publish({ status: 'checking', error: undefined });
  checking = (async () => {
    try {
      if (process.platform === 'darwin') {
        const { data } = await axios.get('https://api.github.com/repos/extory/modushare/releases/latest', { timeout: 15000 });
        if (data.draft || data.prerelease || typeof data.tag_name !== 'string' || !/^v?\d+\.\d+\.\d+$/.test(data.tag_name) || !Array.isArray(data.assets)) throw new Error('릴리스 정보를 읽을 수 없습니다.');
        const version = data.tag_name.replace(/^v/, '');
        if (!isNewerVersion(version, app.getVersion())) { installerUrl = undefined; publish({ status: 'current', latestVersion: version }); }
        else {
          const asset = data.assets.find((a: { name: string }) => typeof a.name === 'string' && a.name.endsWith('.dmg') && (process.arch === 'arm64' ? a.name.includes('arm64') : !a.name.includes('arm64')));
          const url = new URL(asset?.browser_download_url ?? 'https://invalid.example');
          if (url.origin !== 'https://github.com' || !url.pathname.startsWith('/extory/modushare/releases/download/')) throw new Error('이 Mac용 설치 파일이 아직 게시되지 않았습니다.');
          installerUrl = url.href; available(version);
        }
      } else {
        const result = await autoUpdater.checkForUpdates();
        if (!result) throw new Error('업데이트 정보를 확인하지 못했습니다.');
      }
    } catch (err) { publish({ status: 'error', error: (err as Error).message }); }
    return getUpdateState();
  })().finally(() => { checking = null; });
  return checking;
}
export async function downloadUpdate(): Promise<UpdateState> {
  if (!['available', 'manual'].includes(getUpdateState().status) || !isNewerVersion(getUpdateState().latestVersion ?? '', app.getVersion())) return getUpdateState();
  publish({ status: 'downloading', error: undefined, percent: 0 });
  try {
    if (process.platform === 'darwin') {
      if (!installerUrl) throw new Error('업데이트를 다시 확인하세요.');
      await shell.openExternal(installerUrl);
      publish({ status: 'manual' });
    } else { await autoUpdater.downloadUpdate(); }
  } catch (err) { publish({ status: 'error', error: (err as Error).message }); }
  return getUpdateState();
}
export function installUpdate(): void {
  if (getUpdateState().status !== 'downloaded' || process.platform === 'darwin') return;
  autoUpdater.quitAndInstall(false, true);
}
export function setupAutoUpdater(store: Store<AppStore>): void {
  settings = store;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.on('update-available', info => available(info.version));
  autoUpdater.on('update-not-available', info => publish({ status: 'current', latestVersion: info.version }));
  autoUpdater.on('download-progress', progress => publish({ status: 'downloading', percent: Math.round(progress.percent) }));
  autoUpdater.on('update-downloaded', () => {
    publish({ status: 'downloaded', percent: 100 });
    const notification = new Notification({ title: 'ModuShare – 업데이트 준비 완료', body: '클릭하면 설치 후 다시 시작합니다.' });
    notification.on('click', installUpdate); notification.show();
  });
  autoUpdater.on('error', err => publish({ status: 'error', error: err.message }));
  void checkForUpdates();
  setInterval(() => { void checkForUpdates(); }, 4 * 60 * 60 * 1000);
}
