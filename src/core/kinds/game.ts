import { z } from 'zod';
import { defineKind, emptySecret } from './registry';

export const gameStatuses = ['planning', 'announced', 'running', 'finished'] as const;
export type GameStatus = (typeof gameStatuses)[number];

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .catch(null);

export const gameKind = defineKind({
  kind: 'game',
  data: z.object({
    description: z.string().default(''),
    status: z.enum(gameStatuses).catch('planning').default('planning'),
    starts_on: isoDate.default(null),
    ends_on: isoDate.default(null),
    venue: z.string().default(''),
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['description', 'venue'],
});
