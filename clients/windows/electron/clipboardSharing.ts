import { app, BrowserWindow, clipboard, ipcMain, Menu, Notification, screen } from 'electron';
import path from 'path';
import axios from 'axios';
import Store from 'electron-store';
import { AppStore } from './main';
import { WSClient } from './wsClient';

let inboxWindow: BrowserWindow | null = null;
let senderWindow: BrowserWindow | null = null;
let currentStore: Store<AppStore>;
let snapshot: { contentType: string; content?: string; imageData?: string } | null = null;
const overlays = new Set<BrowserWindow>();

export function flyPaper(direction: 'send' | 'receive'): void {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { bounds, workArea } = display;
  // Use the reserved edge for a left/right/top Dock or taskbar, bottom otherwise.
  let x = bounds.width * .5, y = bounds.height - 18;
  if (workArea.x > bounds.x) { x = 18; y = bounds.height * .5; }
  else if (workArea.x + workArea.width < bounds.x + bounds.width) { x = bounds.width - 18; y = bounds.height * .5; }
  else if (workArea.y > bounds.y + 40) { y = 18; }
  const win = new BrowserWindow({ ...bounds, transparent: true, frame: false, show: false,
    focusable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  overlays.add(win);
  win.setIgnoreMouseEvents(true);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(__dirname, '../../renderer/flight.html'), { query: { direction, x: String(x), y: String(y) } });
  win.once('ready-to-show', () => win.showInactive());
  win.on('closed', () => overlays.delete(win));
  setTimeout(() => { if (!win.isDestroyed()) win.destroy(); }, 2200);
}

export function openInbox(): void {
  if (!currentStore?.get('accessToken')) return;
  if (inboxWindow && !inboxWindow.isDestroyed()) { inboxWindow.show(); inboxWindow.focus(); return; }
  inboxWindow = createWindow('수신함', 'inbox.html');
  inboxWindow.on('closed', () => { inboxWindow = null; });
}
function createWindow(title: string, file: string): BrowserWindow {
  const win = new BrowserWindow({ width: 620, height: 660, title: `ModuShare – ${title}`,
    webPreferences: { preload: path.join(__dirname, 'sharingPreload.js'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.loadFile(path.join(__dirname, '../../renderer', file));
  win.webContents.on('context-menu', () => Menu.buildFromTemplate([
    { label: '복사한 내용 보내기…', click: openClipboardSender },
    { label: '받은 복사함 열기', click: openInbox },
  ]).popup({ window: win }));
  return win;
}
export function openClipboardSender(): void {
  if (!currentStore?.get('accessToken')) return;
  if (senderWindow && !senderWindow.isDestroyed()) { senderWindow.focus(); return; }
  const image = clipboard.readImage();
  snapshot = !image.isEmpty() ? { contentType: 'image', imageData: image.toPNG().toString('base64') }
    : { contentType: 'text', content: clipboard.readText() };
  senderWindow = createWindow('보내기', 'send.html');
  senderWindow.on('closed', () => { senderWindow = null; snapshot = null; });
}
export function setupClipboardSharing(store: Store<AppStore>, ws: WSClient): void {
  currentStore = store;
  store.onDidChange('userEmail', () => { inboxWindow?.close(); senderWindow?.close(); });
  store.onDidChange('serverUrl', () => { inboxWindow?.close(); senderWindow?.close(); });
  const request = () => axios.create({ baseURL: `${store.get('serverUrl')}/clipboard/direct`,
    headers: { Authorization: `Bearer ${store.get('accessToken')}` } });
  const items = async () => (await request().get(`/inbox/${encodeURIComponent(store.get('deviceId'))}`)).data.items;
  const handle = (channel: string, action: (...args: any[]) => any) => ipcMain.handle(channel, async (event, ...args) => {
    if (![inboxWindow?.webContents, senderWindow?.webContents].includes(event.sender) || !store.get('accessToken'))
      return { ok: false, error: '로그인이 필요합니다.' };
    try { return { ok: true, ...await action(...args) }; }
    catch (error) { return { ok: false, error: (error as any)?.response?.data?.error || (error as Error).message }; }
  });
  handle('clipboard:targets', async () => ({ devices: (await request().get('/targets')).data.devices.filter(
    (d: { deviceId: string; email: string }) => d.deviceId !== store.get('deviceId') || d.email !== store.get('userEmail')),
    preview: snapshot?.contentType === 'image' ? '이미지' : snapshot?.content?.slice(0, 300) || '복사한 내용이 없습니다.' }));
  handle('clipboard:send', async (targets) => {
    if (!snapshot || (snapshot.contentType === 'text' && !snapshot.content)) throw new Error('먼저 내용을 복사하세요.');
    const result = await request().post('/send', { targets, payload: snapshot });
    flyPaper('send');
    return result.data;
  });
  handle('clipboard:inbox', async () => ({ items: await items() }));
  handle('clipboard:select', async (id: string) => {
    const item = (await items()).find((i: { id: string }) => i.id === id);
    if (!item) throw new Error('보관 기간이 지난 항목입니다. 수신함을 새로고침하세요.');
    if (!await ws.writeClipboard(item.payload)) throw new Error('더 최신 복사 내용이 도착했습니다. 다시 선택하세요.');
    inboxWindow?.hide();
    return {};
  });
  let refreshGeneration = 0;
  const checkIncoming = async () => {
    const generation = ++refreshGeneration;
    const account = JSON.stringify([store.get('serverUrl'), store.get('userEmail'), store.get('deviceId')]);
    try {
      const received = await items();
      if (generation !== refreshGeneration || account !== JSON.stringify([store.get('serverUrl'), store.get('userEmail'), store.get('deviceId')])) return;
      inboxWindow?.webContents.send('clipboard:changed');
      const head = received[0]?.id;
      if (!head || store.get('inboxHeads')[account] === head) return;
      store.set('inboxHeads', { ...store.get('inboxHeads'), [account]: head });
      flyPaper('receive');
      app.dock?.bounce('informational');
      inboxWindow?.flashFrame(true);
      const notification = new Notification({ title: 'ModuShare – 복사 내용 도착', body: '받은 복사함에서 내용을 선택해 붙여넣으세요.' });
      notification.on('click', openInbox);
      notification.show();
    } catch { /* Offline inbox is retried on reconnect or when opened. */ }
  };
  ws.on('directClipboard', checkIncoming);
  ws.on('statusChange', () => { if (ws.isConnected()) void checkIncoming(); });
  ws.on('remoteClipboard', () => flyPaper('receive'));
  ws.on('clipboardSent', () => flyPaper('send'));
  app.on('activate', openInbox);
}
