import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('sharing', {
  targets: () => ipcRenderer.invoke('clipboard:targets'),
  send: (targets: unknown) => ipcRenderer.invoke('clipboard:send', targets),
  inbox: () => ipcRenderer.invoke('clipboard:inbox'),
  select: (id: string) => ipcRenderer.invoke('clipboard:select', id),
  onChanged: (callback: () => void) => ipcRenderer.on('clipboard:changed', callback),
});
