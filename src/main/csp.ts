import type { ConnectionConfig } from '@core/connection';

/**
 * Content-Security-Policy for the renderer. The only remote origin allowed is
 * the configured Supabase project (HTTPS and its realtime WebSocket).
 */
export function buildCsp(config: ConnectionConfig | null, options: { dev: boolean }): string {
  const connect = ["'self'"];
  if (config) {
    const url = new URL(config.supabaseUrl);
    connect.push(`https://${url.host}`, `wss://${url.host}`);
  }
  if (options.dev) connect.push('ws://localhost:*', 'http://localhost:*');

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // The dev server injects an inline React Refresh preamble; release builds never allow inline scripts.
    'script-src': options.dev ? ["'self'", "'unsafe-inline'"] : ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': connect,
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'none'"],
    'frame-ancestors': ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}
