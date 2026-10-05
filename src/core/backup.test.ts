import { describe, expect, it } from 'vitest';
import { backupFileName, buildBackup } from './backup';

describe('backup', () => {
  it('records counts and metadata', () => {
    const backup = buildBackup({
      appVersion: '0.1.0',
      exportedAt: new Date('2026-10-05T12:00:00Z'),
      team: { id: 't', name: 'Spolek' },
      tables: { records: [{}, {}], people: [{}] },
    });
    expect(backup).toMatchObject({
      format: 'zazemi-backup',
      version: 1,
      app_version: '0.1.0',
      exported_at: '2026-10-05T12:00:00.000Z',
      counts: { records: 2, people: 1 },
    });
  });

  it('makes a safe ASCII file name', () => {
    expect(backupFileName('Chýnický LARP!', new Date(2026, 9, 5))).toBe(
      'zazemi-zaloha-chynicky-larp-2026-10-05.json',
    );
    expect(backupFileName('***', new Date(2026, 0, 1))).toBe('zazemi-zaloha-tym-2026-01-01.json');
  });
});
