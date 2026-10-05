import { z } from 'zod';
import { defineKind, emptySecret } from './registry';

export const folderKind = defineKind({
  kind: 'folder',
  data: z.object({}),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: [],
});
