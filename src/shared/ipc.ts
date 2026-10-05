import { z } from 'zod';
import { connectionConfigSchema } from '@core/connection';

export { IPC } from './channels';

/** Input schemas for IPC channels, validated in main (CLAUDE.md, Electron conventions). */
export const configSetInput = connectionConfigSchema;

export const openExternalInput = z
  .url()
  .refine((value) => new URL(value).protocol === 'https:', { message: 'https-only' });
