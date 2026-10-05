import { describe, expect, it } from 'vitest';
import { parseInviteLink, saveFileInput, secureKeyInput } from './ipc';

describe('parseInviteLink', () => {
  it('reads the code from an invite link', () => {
    expect(parseInviteLink('zazemi://pozvanka/LIPNO-7K3Q')).toBe('LIPNO-7K3Q');
    expect(parseInviteLink('zazemi://pozvanka/lipno-7k3q/')).toBe('LIPNO-7K3Q');
  });
  it('rejects anything else', () => {
    for (const bad of [
      'https://pozvanka/LIPNO-7K3Q',
      'zazemi://pozvanka/LIPNO',
      'zazemi://jine/LIPNO-7K3Q',
      'zazemi://pozvanka/LIPNO-7K3Q/../x',
      'zazemi://pozvanka/LIP0O-7K3Q',
      'nesmysl',
    ]) {
      expect(parseInviteLink(bad), bad).toBeNull();
    }
  });
});

describe('IPC input schemas', () => {
  it('limits secure-storage keys to simple names', () => {
    expect(secureKeyInput.safeParse('sb-127-auth-token').success).toBe(true);
    expect(secureKeyInput.safeParse('../config').success).toBe(false);
    expect(secureKeyInput.safeParse('').success).toBe(false);
  });
  it('refuses file names with path characters', () => {
    const base = { filters: [], data: new Uint8Array([1]) };
    expect(saveFileInput.safeParse({ ...base, defaultName: 'zaloha.json' }).success).toBe(true);
    expect(saveFileInput.safeParse({ ...base, defaultName: '..\\evil.exe' }).success).toBe(false);
    expect(saveFileInput.safeParse({ ...base, defaultName: 'a/b.json' }).success).toBe(false);
  });
});

describe('backup entry paths', () => {
  it('accepts relative paths and refuses escapes', async () => {
    const { backupEntryInput } = await import('./ipc');
    expect(backupEntryInput.safeParse('soubory/Hra/Dopis č. 12.docx').success).toBe(true);
    for (const bad of ['../x', '/etc/passwd', 'C:\\x', 'a//b', 'a/../b', 'a\\..\\b']) {
      expect(backupEntryInput.safeParse(bad).success, bad).toBe(false);
    }
  });
});
