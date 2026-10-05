import { z } from 'zod';
import { defineKind, emptySecret } from './registry';

/** Where a sheet section is stored, and therefore who can read it. */
export const sectionAudiences = ['player', 'organizers', 'public'] as const;
export type SectionAudience = (typeof sectionAudiences)[number];

export const sectionTypes = ['text', 'relationships', 'groups', 'definitions', 'property'] as const;
export type SectionType = (typeof sectionTypes)[number];

export const sheetSection = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,40}$/),
  title: z.string(),
  type: z.enum(sectionTypes).catch('text'),
  audience: z.enum(sectionAudiences).catch('player'),
  hint: z.string().default(''),
});
export type SheetSection = z.infer<typeof sheetSection>;

/** The sections our current sheets use (from the brief). */
export const defaultSections: SheetSection[] = [
  {
    key: 'backstory',
    title: 'Minulost',
    type: 'text',
    audience: 'player',
    hint: 'Odkud postava pochází a co ji formovalo.',
  },
  { key: 'personality', title: 'Povaha', type: 'text', audience: 'player', hint: '' },
  {
    key: 'role',
    title: 'Role v osadě',
    type: 'text',
    audience: 'player',
    hint: 'Úřad nebo řemeslo a co to obnáší ve hře.',
  },
  { key: 'groups', title: 'Skupiny a jejich zvyky', type: 'groups', audience: 'player', hint: '' },
  { key: 'relationships', title: 'Vztahy', type: 'relationships', audience: 'player', hint: '' },
  {
    key: 'property',
    title: 'Majetek',
    type: 'property',
    audience: 'player',
    hint: 'Co postava drží podle katalogu předmětů a záznamu převodů.',
  },
  {
    key: 'secrets',
    title: 'Tajemství',
    type: 'text',
    audience: 'player',
    hint: 'Co postava ví a ostatní ne.',
  },
  {
    key: 'org_notes',
    title: 'Poznámky organizátorů',
    type: 'text',
    audience: 'organizers',
    hint: 'Hráč tuto část nikdy neuvidí.',
  },
];

export const DEFAULT_WARNING = 'Neherní materiál – nesdílet';

export const sheetTemplateKind = defineKind({
  kind: 'sheet_template',
  data: z.object({
    warning: z.string().default(DEFAULT_WARNING),
    sections: z.array(sheetSection).catch(defaultSections).default(defaultSections),
    is_default: z.boolean().catch(false).default(false),
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: [],
});

export const sheetStatuses = ['draft', 'ready', 'sent'] as const;
export const costumeStatuses = ['todo', 'partial', 'done'] as const;

export const characterKind = defineKind({
  kind: 'character',
  data: z.object({
    template_id: z.string().nullable().catch(null).default(null),
    /** Post or job in the settlement, shown in the roster. */
    post: z.string().default(''),
    house_number: z.string().default(''),
    sheet_status: z.enum(sheetStatuses).catch('draft').default('draft'),
    costume_status: z.enum(costumeStatuses).catch('todo').default('todo'),
    faction_ids: z.array(z.string()).catch([]).default([]),
    definition_ids: z.array(z.string()).catch([]).default([]),
    /** Section texts the player may read (audience "player"). */
    sections: z.record(z.string(), z.string()).catch({}).default({}),
  }),
  /** Organizer-only section texts (audience "organizers"). */
  secret: z.object({ sections: z.record(z.string(), z.string()).catch({}).default({}) }),
  defaultVisibility: 'organizers',
  searchFields: ['post'],
});

/** Public cast-list entry of a character (audience "public" sections). */
export const characterProfileKind = defineKind({
  kind: 'character_profile',
  data: z.object({ sections: z.record(z.string(), z.string()).catch({}).default({}) }),
  secret: emptySecret,
  defaultVisibility: 'everyone',
  searchFields: [],
});

export const factionTypes = ['faction', 'opinion', 'clan', 'ethnic', 'religious'] as const;
export const factionKind = defineKind({
  kind: 'faction',
  data: z.object({
    type: z.enum(factionTypes).catch('faction').default('faction'),
    description: z.string().default(''),
    customs: z.string().default(''),
    beliefs: z.string().default(''),
    laws: z.string().default(''),
    vocabulary: z.string().default(''),
  }),
  secret: z.object({ notes: z.string().default('') }),
  defaultVisibility: 'organizers',
  searchFields: ['description', 'customs', 'beliefs', 'laws', 'vocabulary'],
});

export const knownBy = ['both', 'from', 'to'] as const;
export const relationshipKind = defineKind({
  kind: 'relationship',
  data: z.object({
    from_id: z.string().default(''),
    to_id: z.string().default(''),
    label: z.string().default(''),
    note: z.string().default(''),
    /** Rule R6: which side's player can read it. */
    known_by: z.enum(knownBy).catch('both').default('both'),
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['label', 'note'],
});

export const npcKind = defineKind({
  kind: 'npc',
  data: z.object({
    rank: z.string().default(''),
    description: z.string().default(''),
    abilities: z.string().default(''),
    costume: z.string().default(''),
  }),
  secret: z.object({ notes: z.string().default('') }),
  defaultVisibility: 'organizers',
  searchFields: ['rank', 'description'],
});

export const prepStatuses = ['not_started', 'done'] as const;
export const npcAppearanceKind = defineKind({
  kind: 'npc_appearance',
  data: z.object({
    situation: z.string().default(''),
    health: z.string().default(''),
    speed: z.string().default(''),
    strength: z.string().default(''),
    description: z.string().default(''),
    abilities: z.string().default(''),
    prep_status: z.enum(prepStatuses).catch('not_started').default('not_started'),
    block_id: z.string().nullable().catch(null).default(null),
    scene: z.string().default(''),
    /** Local date-time "2027-05-14T18:30" (event time, no time zone). */
    starts_at: z.string().default(''),
    ends_at: z.string().default(''),
    actor_person_id: z.string().nullable().catch(null).default(null),
    /** Played (set from the live dashboard, M7). */
    done: z.boolean().catch(false).default(false),
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['situation', 'scene', 'description'],
});

export const phaseKind = defineKind({
  kind: 'phase',
  data: z.object({
    /** As written on the run-of-show: "0", "I", "II"… */
    label: z.string().default(''),
    order: z.number().catch(0).default(0),
    trigger: z.string().default(''),
    description: z.string().default(''),
    /** Hand-written checklist items, next to the generated ones (M3). */
    tasks: z
      .array(z.object({ id: z.string(), text: z.string(), done: z.boolean().catch(false) }))
      .catch([])
      .default([]),
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['trigger', 'description'],
});

export const blockKind = defineKind({
  kind: 'block',
  data: z.object({
    phase_id: z.string().nullable().catch(null).default(null),
    order: z.number().catch(0).default(0),
    starts_at: z.string().default(''),
    ends_at: z.string().default(''),
    description: z.string().default(''),
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['description'],
});

export const definitionTypes = ['race', 'class', 'profession', 'skill'] as const;
export const definitionKind = defineKind({
  kind: 'definition',
  data: z.object({
    type: z.enum(definitionTypes).catch('skill').default('skill'),
    description: z.string().default(''),
    rules: z.string().default(''),
  }),
  secret: emptySecret,
  defaultVisibility: 'everyone',
  searchFields: ['description', 'rules'],
});
