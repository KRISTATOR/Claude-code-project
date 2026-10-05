import { describe, expect, it } from 'vitest';
import { gameKind, readData } from '.';

describe('readData', () => {
  it('fills defaults for missing fields', () => {
    expect(readData(gameKind, { data: {} })).toEqual({
      description: '',
      status: 'planning',
      starts_on: null,
      ends_on: null,
      venue: '',
    });
  });

  it('keeps valid values and repairs invalid ones', () => {
    const data = readData(gameKind, {
      data: { status: 'running', starts_on: '2027-05-14', ends_on: 'zítra', venue: 'Statek' },
    });
    expect(data).toMatchObject({
      status: 'running',
      starts_on: '2027-05-14',
      ends_on: null,
      venue: 'Statek',
    });
  });

  it('repairs an unknown status', () => {
    expect(readData(gameKind, { data: { status: 'nonsense' } }).status).toBe('planning');
  });
});
