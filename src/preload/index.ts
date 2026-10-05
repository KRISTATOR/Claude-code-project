import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { OfficeEvent, UpdateStatus, ZazemiApi } from '../shared/api';
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
  print: {
    toPdf: (request) => ipcRenderer.invoke(IPC.printPdf, request),
    exportFonts: () => ipcRenderer.invoke(IPC.fontsExport),
  },
  blobs: {
    has: (sha) => ipcRenderer.invoke(IPC.blobHas, sha),
    get: (sha) => ipcRenderer.invoke(IPC.blobGet, sha),
    put: (sha, data) => ipcRenderer.invoke(IPC.blobPut, sha, data),
    usage: () => ipcRenderer.invoke(IPC.blobUsage),
  },
  office: {
    openForEdit: (request) => ipcRenderer.invoke(IPC.officeOpenEdit, request),
    openReadOnly: (request) => ipcRenderer.invoke(IPC.officeOpenView, request),
    readWorking: (fileId) => ipcRenderer.invoke(IPC.officeReadWorking, fileId),
    markUploaded: (fileId, sha) => ipcRenderer.invoke(IPC.officeMarkUploaded, fileId, sha),
    finish: (fileId) => ipcRenderer.invoke(IPC.officeFinish, fileId),
    discard: (fileId) => ipcRenderer.invoke(IPC.officeDiscard, fileId),
    sessions: () => ipcRenderer.invoke(IPC.officeSessions),
    onEvent: (listener) => {
      const handler = (_event: IpcRendererEvent, event: OfficeEvent) => listener(event);
      ipcRenderer.on(IPC.officeEvent, handler);
      return () => ipcRenderer.removeListener(IPC.officeEvent, handler);
    },
  },
  backup: {
    begin: (defaultName) => ipcRenderer.invoke(IPC.backupBegin, defaultName),
    add: (token, path, data) => ipcRenderer.invoke(IPC.backupAdd, token, path, data),
    finish: (token) => ipcRenderer.invoke(IPC.backupFinish, token),
    abort: (token) => ipcRenderer.invoke(IPC.backupAbort, token),
  },
  archives: {
    open: () => ipcRenderer.invoke(IPC.archivesOpen),
    read: (token, archive, entry) => ipcRenderer.invoke(IPC.archivesRead, token, archive, entry),
    close: (token) => ipcRenderer.invoke(IPC.archivesClose, token),
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
