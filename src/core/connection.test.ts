import { describe, expect, it } from 'vitest';
import {
  connectionConfigSchema,
  decodeConnectionCode,
  encodeConnectionCode,
  looksLikeSecretKey,
} from './connection';

function fakeJwt(payload: object): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

const anonKey = fakeJwt({ role: 'anon', ref: 'abcdefghijklmnop' });
const config = { supabaseUrl: 'https://abcdefghijklmnop.supabase.co', supabaseAnonKey: anonKey };

describe('connection code', () => {
  it('round-trips a valid config', () => {
    const decoded = decodeConnectionCode(encodeConnectionCode(config));
    expect(decoded).toEqual({ ok: true, config });
  });

  it('tolerates surrounding whitespace', () => {
    expect(decodeConnectionCode(`  ${encodeConnectionCode(config)}\n`).ok).toBe(true);
  });

  it('rejects text that is not a code', () => {
    expect(decodeConnectionCode('hello')).toEqual({ ok: false, reason: 'format' });
    expect(decodeConnectionCode('zazemi1:!!!')).toEqual({ ok: false, reason: 'format' });
  });

  it('rejects a code carrying a service-role key', () => {
    const code = encodeConnectionCode({
      ...config,
      supabaseAnonKey: fakeJwt({ role: 'service_role' }),
    });
    expect(decodeConnectionCode(code)).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('connectionConfigSchema', () => {
  it('strips trailing slashes from the URL', () => {
    const parsed = connectionConfigSchema.parse({
      ...config,
      supabaseUrl: `${config.supabaseUrl}/`,
    });
    expect(parsed.supabaseUrl).toBe(config.supabaseUrl);
  });

  it('requires https', () => {
    const result = connectionConfigSchema.safeParse({
      ...config,
      supabaseUrl: 'http://x.supabase.co',
    });
    expect(result.success).toBe(false);
  });

  it('accepts new-style publishable keys', () => {
    const result = connectionConfigSchema.safeParse({
      ...config,
      supabaseAnonKey: 'sb_publishable_0123456789abcdefghij',
    });
    expect(result.success).toBe(true);
  });
});

describe('looksLikeSecretKey', () => {
  it('detects legacy service-role JWTs and new secret keys', () => {
    expect(looksLikeSecretKey(fakeJwt({ role: 'service_role' }))).toBe(true);
    expect(looksLikeSecretKey('sb_secret_abcdefghijklmnopqrstuvwxyz')).toBe(true);
  });
  it('lets anon and publishable keys through', () => {
    expect(looksLikeSecretKey(anonKey)).toBe(false);
    expect(looksLikeSecretKey('sb_publishable_abcdefghijklmnopqrst')).toBe(false);
  });
});
