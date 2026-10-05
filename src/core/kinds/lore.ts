import { z } from 'zod';
import { richDoc } from '../richtext';
import { defineKind, emptySecret } from './registry';

/** Milestone 3 kinds: lore, canon, time, plots, quests, issues and rules. */

const id = z.string().nullable().catch(null).default(null);
const ids = z.array(z.string()).catch([]).default([]);
const order = z.number().catch(0).default(0);

export const pageSubtypes = [
  'place',
  'organization',
  'person',
  'law',
  'religion',
  'event',
  'history',
  'other',
] as const;
export type PageSubtype = (typeof pageSubtypes)[number];

/** A wiki page in a world (or one game): places, off-stage people, decrees… */
export const pageKind = defineKind({
  kind: 'page',
  data: z.object({
    subtype: z.enum(pageSubtypes).catch('other').default('other'),
    summary: z.string().default(''),
    body: richDoc,
  }),
  secret: z.object({ notes: z.string().default('') }),
  defaultVisibility: 'organizers',
  searchFields: ['summary', 'body'],
});

export const canonFields = ['title', 'house_number', 'post', 'age', 'date', 'other'] as const;
export type CanonField = (typeof canonFields)[number];

/**
 * One fact that must stay the same everywhere ("Hraběnka bydlí v č. 4").
 * When the subject is a character, the consistency checker compares the
 * fact with the character record.
 */
export const canonEntryKind = defineKind({
  kind: 'canon_entry',
  data: z.object({
    subject_id: id,
    subject_name: z.string().default(''),
    field: z.enum(canonFields).catch('other').default('other'),
    /** The attribute's name when `field` is "other" ("barva erbu"). */
    label: z.string().default(''),
    value: z.string().default(''),
    source: z.string().default(''),
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['subject_name', 'label', 'value', 'source'],
});

/** In-world history: dated relative to the game (year 0), e.g. -120 = 120 years before. */
export const historyEventKind = defineKind({
  kind: 'history_event',
  data: z.object({
    year: z.number().nullable().catch(null).default(null),
    /** How the date reads in the world ("léta Páně 1621", "za krále Ondřeje"). */
    when_label: z.string().default(''),
    order,
    body: richDoc,
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['when_label', 'body'],
});

export const beatTypes = ['scene', 'announcement', 'logistics', 'other'] as const;

/** One line of the run-of-show inside a phase and block. */
export const beatKind = defineKind({
  kind: 'beat',
  data: z.object({
    phase_id: id,
    block_id: id,
    /** Local event time "2027-05-14T18:30", or empty. */
    at: z.string().default(''),
    type: z.enum(beatTypes).catch('scene').default('scene'),
    location: z.string().default(''),
    who: z.string().default(''),
    description: z.string().default(''),
    done: z.boolean().catch(false).default(false),
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['location', 'who', 'description'],
});

export const threadStatuses = ['idea', 'active', 'resolved', 'cut'] as const;

export const plotThreadKind = defineKind({
  kind: 'plot_thread',
  data: z.object({
    status: z.enum(threadStatuses).catch('idea').default('idea'),
    summary: richDoc,
    phase_ids: ids,
  }),
  secret: z.object({ resolution: z.string().default('') }),
  defaultVisibility: 'organizers',
  searchFields: ['summary'],
});

export const clueStatuses = ['planned', 'placed', 'found', 'cut'] as const;

/** A clue and where it lives: held by a character, NPC, page or file, or a place in the field. */
export const clueKind = defineKind({
  kind: 'clue',
  data: z.object({
    thread_ids: ids,
    holder_id: id,
    location: z.string().default(''),
    phase_id: id,
    status: z.enum(clueStatuses).catch('planned').default('planned'),
    description: z.string().default(''),
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['location', 'description'],
});

export const questTypes = ['quest', 'job'] as const;
export const questStatuses = ['draft', 'open', 'taken', 'done', 'failed'] as const;

/** Quests and job-board offers; the resolution is organizer-only. */
export const questKind = defineKind({
  kind: 'quest',
  data: z.object({
    type: z.enum(questTypes).catch('quest').default('quest'),
    giver_id: id,
    giver_name: z.string().default(''),
    description: z.string().default(''),
    reward: z.string().default(''),
    conditions: z.string().default(''),
    phase_id: id,
    status: z.enum(questStatuses).catch('draft').default('draft'),
    thread_id: id,
  }),
  secret: z.object({ resolution: z.string().default('') }),
  defaultVisibility: 'organizers',
  searchFields: ['description', 'reward', 'giver_name'],
});

/** A personal hook for one character (parent_id); can be shared with its player. */
export const hookKind = defineKind({
  kind: 'hook',
  data: z.object({
    text: z.string().default(''),
    thread_id: id,
    delivered: z.boolean().catch(false).default(false),
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['text'],
});

export const issueStatuses = ['open', 'resolved'] as const;
export const issuePriorities = ['low', 'normal', 'high'] as const;

/** An open question or problem the organizers must resolve. */
export const issueKind = defineKind({
  kind: 'issue',
  data: z.object({
    status: z.enum(issueStatuses).catch('open').default('open'),
    priority: z.enum(issuePriorities).catch('normal').default('normal'),
    assignee_id: id,
    related_ids: ids,
    description: z.string().default(''),
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['description'],
});

/** A rulebook (per world or game); its sections and glossary are child records. */
export const rulebookKind = defineKind({
  kind: 'rulebook',
  data: z.object({ intro: z.string().default('') }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['intro'],
});

export const ruleSectionTypes = ['rules', 'safety'] as const;

export const ruleSectionKind = defineKind({
  kind: 'rule_section',
  data: z.object({
    type: z.enum(ruleSectionTypes).catch('rules').default('rules'),
    order,
    body: richDoc,
  }),
  /** How it works behind the scenes (dice, hidden numbers): never printed for players. */
  secret: z.object({ mechanics: z.string().default('') }),
  defaultVisibility: 'organizers',
  searchFields: ['body'],
});

export const glossaryTermKind = defineKind({
  kind: 'glossary_term',
  data: z.object({ definition: z.string().default('') }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['definition'],
});

const snapshotSection = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(ruleSectionTypes).catch('rules'),
  text: z.string(),
});
export type RuleSnapshotSection = z.infer<typeof snapshotSection>;

/** A published, frozen copy of a rulebook ("v1"), for "what changed since v1". */
export const rulebookVersionKind = defineKind({
  kind: 'rulebook_version',
  data: z.object({
    label: z.string().default(''),
    published_at: z.string().default(''),
    sections: z.array(snapshotSection).catch([]).default([]),
    glossary: z
      .array(z.object({ term: z.string(), definition: z.string() }))
      .catch([])
      .default([]),
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: [],
});
