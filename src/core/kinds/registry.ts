import { z } from 'zod';
import type { RecordRow, Visibility } from '../model';

/**
 * One definition per record kind (CLAUDE.md, code conventions): the schema of
 * its public `data` and organizer-only `secret`, the default visibility, and
 * which fields search should index.
 */
export interface KindDefinition<
  Data extends z.ZodType = z.ZodType,
  Secret extends z.ZodType = z.ZodType,
> {
  kind: string;
  data: Data;
  secret: Secret;
  defaultVisibility: Visibility;
  /** Text fields of `data` that the search index should include. */
  searchFields: readonly string[];
}

export function defineKind<Data extends z.ZodType, Secret extends z.ZodType>(
  definition: KindDefinition<Data, Secret>,
): KindDefinition<Data, Secret> {
  return definition;
}

/**
 * Reads a record's data with its kind's schema. Invalid or missing fields fall
 * back to defaults instead of crashing the UI, because the server only checks
 * that `data` is an object.
 */
export function readData<Data extends z.ZodType>(
  definition: KindDefinition<Data>,
  record: Pick<RecordRow, 'data'>,
): z.infer<Data> {
  const parsed = definition.data.safeParse(record.data);
  if (parsed.success) return parsed.data;
  return definition.data.parse({});
}

export const emptySecret = z.object({}).catchall(z.unknown());

/** Reads a record's organizer-only part with its kind's schema (defaults if absent). */
export function readSecret<Secret extends z.ZodType>(
  definition: KindDefinition<z.ZodType, Secret>,
  secret: { data: Record<string, unknown> } | undefined,
): z.infer<Secret> {
  const parsed = definition.secret.safeParse(secret?.data ?? {});
  if (parsed.success) return parsed.data;
  return definition.secret.parse({});
}
