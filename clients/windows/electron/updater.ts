import { autoUpdater } from 'electron-updater';
import { Notification, shell } from 'electron';
import Store from 'electron-store';
import { AppStore } from './main';

const DOWNLOAD_URL = 'https://github.com/extory/modushare/releases/latest';
// Check for updates once on startup, then every 4 hours
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

export function setupAutoUpdater(store: Store<AppStore>): void {
  // Never auto-download: we control download based on user preference
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  // Disable update prompt that blocks the main process (we show our own UI)
  autoUpdater.allowDowngrade = false;

  // ── Update available ────────────────────────────────────────────────────────
  autoUpdater.on('update-available', (info) => {
    const autoUpdate = store.get('autoUpdate');
    const newVersion = info.version as string;

    if (autoUpdate) {
      // Auto-download and install
      new Notification({
        title: 'ModuShare – 업데이트 다운로드 중',
        body: `v${newVersion} 업데이트를 다운로드하고 있습니다. 완료 후 자동 설치됩니다.`,
      }).show();
      autoUpdater.downloadUpdate().catch((err) => {
        console.error('[updater] Download failed:', err);
      });
    } else {
      // Just notify — user can go download manually
      const n = new Notification({
        title: 'ModuShare – 업데이트 있음',
        body: `v${newVersion}이 출시되었습니다. 클릭하여 다운로드 페이지를 엽니다.`,
      });
      n.on('click', () => shell.openExternal(DOWNLOAD_URL));
      n.show();
    }
  });

  // ── Download progress ───────────────────────────────────────────────────────
  autoUpdater.on('download-progress', (progress) => {
    console.log(`[updater] Download progress: ${Math.round(progress.percent)}%`);
  });

  // ── Update downloaded ───────────────────────────────────────────────────────
  autoUpdater.on('update-downloaded', (info) => {
    const n = new Notification({
      title: 'ModuShare – 업데이트 준비 완료',
      body: `v${info.version} 업데이트가 준비되었습니다. 클릭하면 지금 설치하고 재시작합니다.`,
      actions: [{ type: 'button', text: '지금 설치' }],
      closeButtonText: '나중에',
    });
    n.on('click', () => {
      autoUpdater.quitAndInstall(false, true);
    });
    n.on('action', () => {
      autoUpdater.quitAndInstall(false, true);
    });
    n.show();
  });

  // ── Error ───────────────────────────────────────────────────────────────────
  autoUpdater.on('error', (err) => {
    console.error('[updater] Error:', err.message);
  });

  // ── Initial check + periodic checks ────────────────────────────────────────
  checkForUpdates();
  setInterval(checkForUpdates, CHECK_INTERVAL_MS);
}

function checkForUpdates(): void {
  // In dev (no asar), autoUpdater will error — silently ignore
  try {
    autoUpdater.checkForUpdates().catch(() => {});
  } catch {
    // Not packaged — skip
  }
}
