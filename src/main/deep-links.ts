import { app, type BrowserWindow } from 'electron';
import { parseInviteLink } from '@shared/ipc';
import { IPC } from '@shared/channels';

/**
 * Invite links (zazemi://pozvanka/CODE). On Windows the link arrives as a
 * command-line argument, either at startup or in a second instance.
 */
let pending: string | null = null;

export function registerProtocol(): void {
  if (app.isPackaged) app.setAsDefaultProtocolClient('zazemi');
}

export function inviteFromArgv(argv: readonly string[]): string | null {
  for (const arg of argv) {
    if (arg.startsWith('zazemi:')) {
      const code = parseInviteLink(arg);
      if (code) return code;
    }
  }
  return null;
}

export function rememberStartupInvite(argv: readonly string[]): void {
  pending = inviteFromArgv(argv);
}

export function takePendingInvite(): string | null {
  const code = pending;
  pending = null;
  return code;
}

export function forwardInvite(window: BrowserWindow | null, argv: readonly string[]): void {
  const code = inviteFromArgv(argv);
  if (!code) return;
  if (window) window.webContents.send(IPC.inviteLink, code);
  else pending = code;
}
