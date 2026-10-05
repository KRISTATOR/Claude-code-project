import { z } from 'zod';
import { defineKind, emptySecret } from './registry';

/** Milestone 7 kinds: what the live crew tracks per character during the game. */

export const trackerTypes = ['number', 'level', 'flag'] as const;
export type TrackerType = (typeof trackerTypes)[number];
export const trackerSubjects = ['characters', 'npcs', 'both'] as const;
export type TrackerSubject = (typeof trackerSubjects)[number];

/**
 * A per-game status field (wounds, blood loss, infection, drunkenness…). A
 * "level" is a number shown with its label ("0 zdravý, 1 škrábnutý…"); a
 * "flag" is 0 or 1. Values live in the tracker_readings table.
 */
export const trackerDefinitionKind = defineKind({
  kind: 'tracker_definition',
  data: z.object({
    type: z.enum(trackerTypes).catch('number').default('number'),
    min: z.number().catch(0).default(0),
    max: z.number().nullable().catch(null).default(null),
    /** Labels for "level" values 0, 1, 2… */
    levels: z.array(z.string()).catch([]).default([]),
    initial: z.number().catch(0).default(0),
    /** Highlight a value at or above this (e.g. 3 wounds = unconscious). */
    warn_at: z.number().nullable().catch(null).default(null),
    applies_to: z.enum(trackerSubjects).catch('characters').default('characters'),
    description: z.string().catch('').default(''),
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['description'],
});
