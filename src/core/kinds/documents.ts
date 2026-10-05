import { z } from 'zod';
import { richDoc } from '../richtext';
import { defineKind, emptySecret } from './registry';

/** Milestone 4 kinds: prop documents and everything that prints them. */

const id = z.string().nullable().catch(null).default(null);
const ids = z.array(z.string()).catch([]).default([]);

export const paperSizes = ['A4', 'A5'] as const;
export type PaperSize = (typeof paperSizes)[number];

export const documentTypes = [
  'letter',
  'notice',
  'speech',
  'form',
  'list',
  'newspaper',
  'leaflet',
  'caption',
  'sign',
] as const;
export type DocumentType = (typeof documentTypes)[number];

export const deliveryMethods = [
  'hand',
  'npc',
  'mail',
  'board',
  'read_aloud',
  'place',
  'other',
] as const;

export const documentStatuses = ['draft', 'final', 'printed', 'delivered'] as const;
export type DocumentStatus = (typeof documentStatuses)[number];

/** An in-game prop document: a letter, decree, speech, form… (the brief's fields). */
export const propDocumentKind = defineKind({
  kind: 'prop_document',
  data: z.object({
    /** As printed on the document ("12", "12a"); unique per game. */
    number: z.string().default(''),
    type: z.enum(documentTypes).catch('letter').default('letter'),
    phase_id: id,
    /** The in-world author's writer profile (font, ink, paper, signature). */
    writer_id: id,
    author_name: z.string().default(''),
    /** In-world recipient as written on the document. */
    recipient: z.string().default(''),
    /** Real recipients: the characters whose players get it. */
    character_ids: ids,
    delivery: z.enum(deliveryMethods).catch('hand').default('hand'),
    delivery_note: z.string().default(''),
    /** Position within its phase when delivering. */
    delivery_order: z.number().catch(0).default(0),
    in_world_date: z.string().default(''),
    body: richDoc,
    paper_size: z.enum(paperSizes).catch('A4').default('A4'),
    copies: z.number().int().min(1).catch(1).default(1),
    status: z.enum(documentStatuses).catch('draft').default('draft'),
  }),
  secret: z.object({ notes: z.string().default('') }),
  defaultVisibility: 'organizers',
  searchFields: ['number', 'author_name', 'recipient', 'body'],
});

export const paperStyles = ['plain', 'aged', 'parchment', 'official'] as const;
export type PaperStyle = (typeof paperStyles)[number];

/** How one in-world author's documents look: font, ink, paper, signature. */
export const writerProfileKind = defineKind({
  kind: 'writer_profile',
  data: z.object({
    font_id: z.string().default('eb-garamond'),
    /** Ink colour as #rrggbb. */
    ink: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .catch('#1a1a1a')
      .default('#1a1a1a'),
    paper: z.enum(paperStyles).catch('plain').default('plain'),
    size_pt: z.number().min(6).max(36).catch(13).default(13),
    /** Printed at the top, e.g. the office's name. */
    letterhead: z.string().default(''),
    /** Written under the text in the author's hand. */
    signature: z.string().default(''),
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['letterhead', 'signature'],
});

export const formModes = ['per_character', 'list'] as const;

/**
 * A mail-merge form: one copy per character with {fields} filled in (a census
 * slip), or one list with a row per character.
 */
export const formTemplateKind = defineKind({
  kind: 'form_template',
  data: z.object({
    mode: z.enum(formModes).catch('per_character').default('per_character'),
    body: richDoc,
    /** List mode: the field of each column, in order. */
    columns: z.array(z.string()).catch([]).default([]),
    writer_id: id,
    paper_size: z.enum(paperSizes).catch('A4').default('A4'),
    /** Only characters in these groups (empty: everyone). */
    faction_ids: ids,
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['body'],
});

export const signSizes = ['card', 'A5', 'A4'] as const;

/** A rule text posted at a physical place ("Sklep: odejít jen s klíčem"). */
export const locationSignKind = defineKind({
  kind: 'location_sign',
  data: z.object({
    body: richDoc,
    /** The wiki place it stands at (and later the map object, M5). */
    place_id: id,
    place_name: z.string().default(''),
    map_object_id: id,
    size: z.enum(signSizes).catch('card').default('card'),
    writer_id: id,
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['body', 'place_name'],
});

/** The character diary booklet design for one game. */
export const diaryDesignKind = defineKind({
  kind: 'diary_design',
  data: z.object({
    /** Front page title; {jmeno} becomes the character's name. */
    front_title: z.string().default('Deník – {jmeno}'),
    front_text: z.string().default(''),
    back_text: z.string().default(''),
    /** Sheet sections printed inside, by key. */
    section_keys: z.array(z.string()).catch([]).default([]),
    /** Lined pages for the player's own notes. */
    blank_pages: z.number().int().min(0).max(60).catch(4).default(4),
    writer_id: id,
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: [],
});

/** An archive: many documents bound into one paginated PDF with shelf marks. */
export const archiveKind = defineKind({
  kind: 'archive',
  data: z.object({
    intro: z.string().default(''),
    writer_id: id,
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['intro'],
});

const partSource = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('document'), id: z.string() }),
    z.object({ type: z.literal('file'), id: z.string() }),
    z.object({ type: z.literal('text'), body: richDoc }),
  ])
  .catch({ type: 'text', body: { type: 'doc', content: [] } });
export type PartSource = z.infer<typeof partSource>;

/** One item of an archive (parent_id): a document, a PDF from the drive or a text. */
export const archivePartKind = defineKind({
  kind: 'archive_part',
  data: z.object({
    /** Shelf mark "IV/7": section IV, item 7. */
    section: z.number().int().min(1).catch(1).default(1),
    item: z.number().int().min(1).catch(1).default(1),
    source: partSource.default({ type: 'text', body: { type: 'doc', content: [] } }),
    /** For the organizer guide: what this part is for. */
    purpose: z.string().default(''),
    /** Pages already printed; frozen so a supplement never renumbers them. */
    printed: z
      .object({ first_page: z.number().int(), last_page: z.number().int(), at: z.string() })
      .nullable()
      .catch(null)
      .default(null),
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['purpose'],
});

export const printJobStatuses = ['todo', 'printed', 'done'] as const;

/** One line of the print queue: what to print, on what paper, how many. */
export const printJobKind = defineKind({
  kind: 'print_job',
  data: z.object({
    record_ids: ids,
    paper: z.string().default(''),
    copies: z.number().int().min(1).catch(1).default(1),
    status: z.enum(printJobStatuses).catch('todo').default('todo'),
    phase_id: id,
    note: z.string().default(''),
  }),
  secret: emptySecret,
  defaultVisibility: 'organizers',
  searchFields: ['paper', 'note'],
});
