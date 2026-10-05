/**
 * IPC channel names. Kept free of imports so the sandboxed preload bundle stays
 * tiny; input schemas live in ./ipc.ts and are applied in main.
 */
export const IPC = {
  appInfo: 'app:info',
  configGet: 'config:get',
  configSet: 'config:set',
  configClear: 'config:clear',
  updatesGetStatus: 'updates:get-status',
  updatesCheck: 'updates:check',
  updatesInstall: 'updates:install',
  updatesStatus: 'updates:status',
  openExternal: 'shell:open-external',
} as const;
