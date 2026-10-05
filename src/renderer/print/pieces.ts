import type { TFunction } from 'i18next';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { phaseKind, propDocumentKind, readData, writerProfileKind } from '@core/kinds';
import type { PersonRow, RecordPersonRow, RecordRow } from '@core/model';
import type { DocxPiece } from '@core/print/docx';
import { DEFAULT_LOOK, escapeHtml, richHtml, type Look, type PrintPiece } from '@core/print/html';
import { NONE, useAttachments, usePeople, useTeamRecords } from '../data/hooks';

const NO_PEOPLE: PersonRow[] = [];
const NO_ATTACHMENTS: RecordPersonRow[] = [];

/** What printing documents of one game needs to know besides the documents. */
export interface PrintContext {
  writers: Map<string, RecordRow>;
  phases: Map<string, RecordRow>;
  characters: Map<string, RecordRow>;
  people: PersonRow[];
  attachments: RecordPersonRow[];
  t: TFunction;
}

export function usePrintContext(game: RecordRow): PrintContext {
  const { t } = useTranslation();
  const records =
    useTeamRecords(
      (row) =>
        (row.kind === 'writer_profile' && row.world_id === game.world_id) ||
        (row.game_id === game.id && (row.kind === 'phase' || row.kind === 'character')),
      `print:${game.id}`,
    ) ?? NONE;
  const people = usePeople() ?? NO_PEOPLE;
  const attachments = useAttachments() ?? NO_ATTACHMENTS;
  return useMemo(() => {
    const of = (kind: string) =>
      new Map(records.filter((row) => row.kind === kind).map((row) => [row.id, row]));
    return {
      writers: of('writer_profile'),
      phases: of('phase'),
      characters: of('character'),
      people,
      attachments,
      t,
    };
  }, [records, people, attachments, t]);
}

export function lookOf(writer: RecordRow | undefined): Look {
  if (!writer) return DEFAULT_LOOK;
  const data = readData(writerProfileKind, writer);
  return { fontId: data.font_id, ink: data.ink, paper: data.paper, sizePt: data.size_pt };
}

export function phaseLabel(phase: RecordRow | undefined): string {
  if (!phase) return '';
  const label = readData(phaseKind, phase).label;
  return label ? `${label} ${phase.title}` : phase.title;
}

/** "Hraběnka z Lipnova (Hana Hráčka)" for each real recipient. */
export function recipientsLabel(characterIds: string[], context: PrintContext): string {
  return characterIds
    .map((id) => {
      const character = context.characters.get(id);
      if (!character) return '';
      const players = context.attachments
        .filter((row) => row.record_id === id && row.relation === 'player')
        .map((row) => context.people.find((person) => person.id === row.person_id)?.display_name)
        .filter(Boolean);
      return players.length ? `${character.title} (${players.join(', ')})` : character.title;
    })
    .filter(Boolean)
    .join(', ');
}

/** The organizer strip: everything needed to sort and deliver, cut off before handing out. */
export function documentStrip(document: RecordRow, context: PrintContext): string {
  const { t } = context;
  const data = readData(propDocumentKind, document);
  const parts = [
    data.number ? t('documents.stripNumber', { number: data.number }) : '',
    t(`documents.types.${data.type}`),
    data.phase_id ? phaseLabel(context.phases.get(data.phase_id)) : '',
    data.character_ids.length
      ? t('documents.stripFor', { names: recipientsLabel(data.character_ids, context) })
      : '',
    [t(`documents.deliveries.${data.delivery}`), data.delivery_note].filter(Boolean).join(' – '),
    data.copies > 1 ? t('documents.stripCopies', { count: data.copies }) : '',
  ];
  return `✂ ${parts.filter(Boolean).join(' · ')}`;
}

function writerData(document: RecordRow, context: PrintContext) {
  const data = readData(propDocumentKind, document);
  const writer = data.writer_id ? context.writers.get(data.writer_id) : undefined;
  return { data, writer, profile: writer ? readData(writerProfileKind, writer) : undefined };
}

/** A document as print HTML: letterhead, in-world date, text, signature. */
export function documentPiece(
  document: RecordRow,
  context: PrintContext,
  options: { strip?: boolean; fields?: Record<string, string> } = {},
): PrintPiece {
  const { data, writer, profile } = writerData(document, context);
  const signature = profile?.signature || data.author_name;
  const html = [
    profile?.letterhead ? `<div class="letterhead">${escapeHtml(profile.letterhead)}</div>` : '',
    data.in_world_date
      ? `<div style="text-align:right;margin-bottom:1em">${escapeHtml(data.in_world_date)}</div>`
      : '',
    richHtml(data.body, options.fields),
    signature ? `<div class="signature">${escapeHtml(signature)}</div>` : '',
  ].join('');
  return {
    size: data.paper_size,
    look: lookOf(writer),
    html,
    ...(options.strip === false ? {} : { strip: documentStrip(document, context) }),
  };
}

export function documentDocx(document: RecordRow, context: PrintContext): DocxPiece {
  const { data, writer, profile } = writerData(document, context);
  const look = lookOf(writer);
  const signature = profile?.signature || data.author_name;
  return {
    size: data.paper_size,
    fontId: look.fontId,
    ink: look.ink,
    sizePt: look.sizePt,
    strip: documentStrip(document, context),
    ...(profile?.letterhead ? { letterhead: profile.letterhead } : {}),
    ...(data.in_world_date ? { date: data.in_world_date } : {}),
    body: data.body,
    ...(signature ? { signature } : {}),
  };
}
