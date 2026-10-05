import { z } from 'zod';

/**
 * How the app reaches the team's Supabase project. Only the project URL and the
 * anon (or "publishable") key are allowed here; both are safe to ship because
 * row-level security protects the data.
 */
export const connectionConfigSchema = z.object({
  supabaseUrl: z
    .string()
    .trim()
    .pipe(z.url())
    .refine((value) => value.startsWith('https://'), { message: 'url-not-https' })
    .transform((value) => value.replace(/\/+$/, '')),
  supabaseAnonKey: z
    .string()
    .trim()
    .min(20, { message: 'key-too-short' })
    .refine((value) => !looksLikeSecretKey(value), { message: 'key-is-secret' }),
});

export type ConnectionConfig = z.infer<typeof connectionConfigSchema>;

const CODE_PREFIX = 'zazemi1:';

/**
 * Refuses keys that would grant full database access. Legacy service-role keys
 * are JWTs whose payload says `"role":"service_role"`; new-style secret keys
 * start with `sb_secret_`.
 */
export function looksLikeSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  const parts = key.split('.');
  if (parts.length !== 3 || parts[1] === undefined) return false;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1])) as unknown;
    return (
      typeof payload === 'object' &&
      payload !== null &&
      'role' in payload &&
      payload.role === 'service_role'
    );
  } catch {
    return false;
  }
}

/** Encodes a config as a single pasteable "connection code" for players. */
export function encodeConnectionCode(config: ConnectionConfig): string {
  const json = JSON.stringify({ u: config.supabaseUrl, k: config.supabaseAnonKey });
  return CODE_PREFIX + base64UrlEncode(json);
}

export type DecodeResult =
  { ok: true; config: ConnectionConfig } | { ok: false; reason: 'format' | 'invalid' };

export function decodeConnectionCode(code: string): DecodeResult {
  const trimmed = code.trim();
  if (!trimmed.startsWith(CODE_PREFIX)) return { ok: false, reason: 'format' };
  let raw: unknown;
  try {
    raw = JSON.parse(base64UrlDecode(trimmed.slice(CODE_PREFIX.length)));
  } catch {
    return { ok: false, reason: 'format' };
  }
  const shape = z.object({ u: z.string(), k: z.string() }).safeParse(raw);
  if (!shape.success) return { ok: false, reason: 'format' };
  const parsed = connectionConfigSchema.safeParse({
    supabaseUrl: shape.data.u,
    supabaseAnonKey: shape.data.k,
  });
  return parsed.success ? { ok: true, config: parsed.data } : { ok: false, reason: 'invalid' };
}

function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(text: string): string {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
