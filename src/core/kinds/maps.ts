import { z } from 'zod';
import { defineKind, emptySecret } from './registry';

/** Milestone 5 kinds: maps with layers, travel routes and the sleeping plan. */

const id = z.string().nullable().catch(null).default(null);

export const mapTypes = ['site', 'world'] as const;

/** A map: the real venue ("site") or an in-world map; drawn on a canvas or a scan. */
export const mapKind = defineKind({
  kind: 'map',
  data: z.object({
    type: z.enum(mapTypes).catch('world').default('world'),
    /** An image file from the drive drawn under the layers. */
    background_file_id: id,
    width: z.number().int().min(200).max(10000).catch(1600).default(1600),
    height: z.number().int().min(200).max(10000).catch(1100).default(1100),
    /** The scale bar: this many pixels are this many metres. */
    scale_pixels: z.number().positive().catch(100).default(100),
    scale_meters: z.number().positive().catch(50).default(50),
    show_scale: z.boolean().catch(true).default(true),
    show_compass: z.boolean().catch(true).default(true),
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: [],
});

export const mapObjectTypes = [
  'marker',
  'zone',
  'path',
  'rope',
  'gate',
  'building',
  'label',
] as const;
export type MapObjectType = (typeof mapObjectTypes)[number];

export const markerIcons = ['pin', 'danger', 'water', 'fire', 'treasure', 'tent', 'flag'] as const;

export const mapObject = z.object({
  id: z.string(),
  type: z.enum(mapObjectTypes).catch('marker'),
  /** x1, y1, x2, y2… in map pixels (one point for markers, gates, buildings, labels). */
  points: z.array(z.number()).catch([]),
  label: z.string().catch(''),
  /** House number for buildings. */
  number: z.string().catch(''),
  icon: z.enum(markerIcons).catch('pin'),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .catch('#d9480f'),
  /** Links: a wiki place, a location sign, items and clues hidden there. */
  place_id: z.string().nullable().catch(null),
  sign_id: z.string().nullable().catch(null),
  item_ids: z.array(z.string()).catch([]),
  clue_ids: z.array(z.string()).catch([]),
});
export type MapObject = z.infer<typeof mapObject>;

/**
 * One layer of a map (parent_id). Each layer has its own visibility, so a
 * "secret cellar" layer can stay organizer-only while players get a clean map.
 */
export const mapLayerKind = defineKind({
  kind: 'map_layer',
  data: z.object({
    order: z.number().catch(0).default(0),
    objects: z.array(mapObject).catch([]).default([]),
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: [],
});

/** A walking connection between two in-world places (for the distance table). */
export const travelRouteKind = defineKind({
  kind: 'travel_route',
  data: z.object({
    from_id: id,
    from_name: z.string().default(''),
    to_id: id,
    to_name: z.string().default(''),
    /** Walking time in minutes. */
    minutes: z.number().positive().catch(60).default(60),
    note: z.string().default(''),
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['from_name', 'to_name', 'note'],
});

const sleepPlace = z.object({
  id: z.string(),
  name: z.string().catch(''),
  capacity: z.number().int().min(0).catch(0),
  map_object_id: z.string().nullable().catch(null),
});
export type SleepPlace = z.infer<typeof sleepPlace>;

const sleepAssignment = z.object({
  id: z.string(),
  /** A person on the roster (players, NPC actors, organizers). */
  person_id: z.string().nullable().catch(null),
  name: z.string().catch(''),
  place_id: z.string().nullable().catch(null),
  /** From this phase on (null = from the start); a later assignment of the same person wins. */
  from_phase_id: z.string().nullable().catch(null),
});
export type SleepAssignment = z.infer<typeof sleepAssignment>;

/** Who sleeps where, with capacity checks, and moves during the game. */
export const sleepingPlanKind = defineKind({
  kind: 'sleeping_plan',
  data: z.object({
    places: z.array(sleepPlace).catch([]).default([]),
    assignments: z.array(sleepAssignment).catch([]).default([]),
    rules: z.string().default(''),
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['rules'],
});
