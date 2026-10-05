import { z } from 'zod';
import { defineKind, emptySecret } from './registry';

export const fileKind = defineKind({
  kind: 'file',
  data: z.object({
    current_version_id: z.string().nullable().catch(null).default(null),
    current_version_no: z.number().int().catch(0).default(0),
    size: z.number().catch(0).default(0),
    sha256: z.string().catch('').default(''),
    mime: z.string().catch('application/octet-stream').default('application/octet-stream'),
    /** Offered in "Nový ze šablony". */
    is_template: z.boolean().catch(false).default(false),
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: [],
});
