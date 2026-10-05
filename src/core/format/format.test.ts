import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatCzk,
  formatDate,
  formatDateTime,
  formatNumber,
  formatTime,
  parseNumber,
} from '.';

const NBSP = ' ';

describe('formatNumber', () => {
  it('uses a decimal comma and a non-breaking space for thousands', () => {
    expect(formatNumber(1234.5)).toBe(`1${NBSP}234,5`);
  });
  it('rounds to the requested fraction digits', () => {
    expect(formatNumber(2 / 3, 1)).toBe('0,7');
  });
});

describe('formatCzk', () => {
  it('omits decimals for whole crowns', () => {
    expect(formatCzk(1500)).toBe(`1${NBSP}500${NBSP}Kč`);
  });
  it('shows two decimals otherwise', () => {
    expect(formatCzk(12.5)).toBe(`12,50${NBSP}Kč`);
  });
});

describe('formatDate', () => {
  it('formats the Czech way', () => {
    const date = new Date(2026, 9, 5, 14, 32);
    expect(formatDate(date)).toBe('5. 10. 2026');
    expect(formatDateTime(date)).toBe('5. 10. 2026 14:32');
    expect(formatTime(date)).toBe('14:32');
  });
});

describe('formatBytes', () => {
  it('uses decimal units with a decimal comma', () => {
    expect(formatBytes(512)).toBe(`512${NBSP}B`);
    expect(formatBytes(20_400_000)).toBe(`20,4${NBSP}MB`);
    expect(formatBytes(1_000_000_000)).toBe(`1${NBSP}GB`);
  });
});

describe('parseNumber', () => {
  it.each([
    ['1,5', 1.5],
    ['1.5', 1.5],
    ['1 234,5', 1234.5],
    [`1${NBSP}234,5`, 1234.5],
    ['-2', -2],
    ['−2', -2],
    [',5', 0.5],
    ['  42 ', 42],
  ])('parses %j as %d', (input, expected) => {
    expect(parseNumber(input)).toBe(expected);
  });

  it.each(['', 'abc', '1,2,3', '1.2.3', '12a', '--1'])('rejects %j', (input) => {
    expect(parseNumber(input)).toBeNull();
  });
});
