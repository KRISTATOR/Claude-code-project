import { classifyError } from './remote';
import type { Client } from './supabase';

/**
 * Where file bytes live (docs/PLAN.md §2.6). Supabase Storage today; a
 * OneDrive/Microsoft Graph provider could implement the same interface for
 * real co-authoring without touching the UI.
 */
export interface StorageProvider {
  upload(path: string, data: Uint8Array, mime: string): Promise<void>;
  download(path: string): Promise<Uint8Array>;
  remove(paths: string[]): Promise<void>;
  readonly maxFileBytes: number | null;
}

export const BUCKET = 'files';

export class SupabaseStorageProvider implements StorageProvider {
  readonly maxFileBytes = 50 * 1024 * 1024;

  constructor(private readonly client: Client) {}

  async upload(path: string, data: Uint8Array, mime: string): Promise<void> {
    const { error } = await this.client.storage
      .from(BUCKET)
      .upload(path, new Blob([data as BlobPart], { type: mime }), {
        contentType: mime,
        upsert: false,
      });
    if (error) throw classifyError({ message: error.message });
  }

  async download(path: string): Promise<Uint8Array> {
    const { data, error } = await this.client.storage.from(BUCKET).download(path);
    if (error) throw classifyError({ message: error.message });
    return new Uint8Array(await data.arrayBuffer());
  }

  async remove(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const { error } = await this.client.storage.from(BUCKET).remove(paths);
    if (error) throw classifyError({ message: error.message });
  }
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
