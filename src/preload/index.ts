import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { UpdateStatus, ZazemiApi } from '../shared/api';
import { IPC } from '../shared/channels';

const api: ZazemiApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC.appInfo),
  },
  config: {
    get: () => ipcRenderer.invoke(IPC.configGet),
    set: (config) => ipcRenderer.invoke(IPC.configSet, config),
    clear: () => ipcRenderer.invoke(IPC.configClear),
  },
  updates: {
    getStatus: () => ipcRenderer.invoke(IPC.updatesGetStatus),
    check: () => ipcRenderer.invoke(IPC.updatesCheck),
    installNow: () => ipcRenderer.invoke(IPC.updatesInstall),
    onStatus: (listener) => {
      const handler = (_event: IpcRendererEvent, status: UpdateStatus) => listener(status);
      ipcRenderer.on(IPC.updatesStatus, handler);
      return () => ipcRenderer.removeListener(IPC.updatesStatus, handler);
    },
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  },
  secureStore: {
    get: (key) => ipcRenderer.invoke(IPC.secureGet, key),
    set: (key, value) => ipcRenderer.invoke(IPC.secureSet, key, value),
    remove: (key) => ipcRenderer.invoke(IPC.secureRemove, key),
  },
  dialogs: {
    saveFile: (request) => ipcRenderer.invoke(IPC.saveFile, request),
  },
  deepLinks: {
    onInvite: (listener) => {
      const handler = (_event: IpcRendererEvent, code: string) => listener(code);
      ipcRenderer.on(IPC.inviteLink, handler);
      return () => ipcRenderer.removeListener(IPC.inviteLink, handler);
    },
    takePendingInvite: () => ipcRenderer.invoke(IPC.takePendingInvite),
  },
};

contextBridge.exposeInMainWorld('zazemi', api);
