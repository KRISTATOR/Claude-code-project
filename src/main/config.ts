import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { connectionConfigSchema, type ConnectionConfig } from '@core/connection';
import { configFilePath } from './paths';

/** A connection baked in at build time (release builds) wins over a local file. */
export function buildTimeConfig(): ConnectionConfig | null {
  const parsed = connectionConfigSchema.safeParse({
    supabaseUrl: __ZAZEMI_SUPABASE_URL__,
    supabaseAnonKey: __ZAZEMI_SUPABASE_ANON_KEY__,
  });
  return parsed.success ? parsed.data : null;
}

export async function loadConfig(): Promise<ConnectionConfig | null> {
  const fromBuild = buildTimeConfig();
  if (fromBuild) return fromBuild;
  try {
    const raw: unknown = JSON.parse(await readFile(configFilePath(), 'utf8'));
    const parsed = connectionConfigSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function saveConfig(config: ConnectionConfig): Promise<void> {
  const path = configFilePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(config, null, 2), 'utf8');
}

export async function clearConfig(): Promise<void> {
  await rm(configFilePath(), { force: true });
}
