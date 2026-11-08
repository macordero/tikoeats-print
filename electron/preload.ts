// The only doors from the window into the operating system. Kept small on
// purpose: the window renders tickets and talks to Tiko; everything else
// goes through these named calls.

import { contextBridge, ipcRenderer } from 'electron';

const api = {
  store: {
    get: <T = unknown>(key: string): Promise<T | null> => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: unknown): Promise<void> => ipcRenderer.invoke('store:set', key, value),
  },
  token: {
    get: (): Promise<string | null> => ipcRenderer.invoke('token:get'),
    set: (token: string | null): Promise<void> => ipcRenderer.invoke('token:set', token),
  },
  printers: {
    list: (): Promise<{ name: string; displayName: string; isDefault: boolean }[]> =>
      ipcRenderer.invoke('printers:list'),
  },
  print: {
    html: (deviceName: string, html: string, copies: number): Promise<void> =>
      ipcRenderer.invoke('print:html', deviceName, html, copies),
  },
  app: {
    info: (): Promise<{ version: string; platform: string; hostname: string; openAtLogin: boolean }> =>
      ipcRenderer.invoke('app:info'),
    setOpenAtLogin: (on: boolean): Promise<void> => ipcRenderer.invoke('app:setOpenAtLogin', on),
    show: (): Promise<void> => ipcRenderer.invoke('app:show'),
  },
};

contextBridge.exposeInMainWorld('tiko', api);

export type TikoBridge = typeof api;
