import { z } from 'zod';
import { defineKind, emptySecret } from './registry';

export const worldKind = defineKind({
  kind: 'world',
  data: z.object({
    description: z.string().default(''),
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['description'],
});
