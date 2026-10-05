import { characterKind, definitionKind, factionKind, readData } from '../kinds';
import type { PersonRow, RecordPersonRow, RecordRow } from '../model';

/**
 * Mail-merge fields (docs/PLAN.md M4): what {jmeno}, {hrac}, {funkce}… in a
 * form, a diary or a Word template are replaced with. The keys are Czech,
 * ASCII-only, as people type them.
 */
export const CHARACTER_FIELDS = [
  'jmeno',
  'hrac',
  'funkce',
  'dum',
  'skupiny',
  'rasa',
  'dovednosti',
] as const;
export const GENERAL_FIELDS = ['tym', 'svet', 'hra', 'datum'] as const;
export type MergeField = (typeof CHARACTER_FIELDS)[number] | (typeof GENERAL_FIELDS)[number];

export interface MergeContext {
  team: string;
  world: string;
  game: string;
  /** Already formatted (cs-CZ). */
  date: string;
}

export function generalFields(context: MergeContext): Record<string, string> {
  return { tym: context.team, svet: context.world, hra: context.game, datum: context.date };
}

export function characterFields(
  character: RecordRow,
  records: Map<string, RecordRow>,
  people: PersonRow[],
  attachments: RecordPersonRow[],
): Record<string, string> {
  const data = readData(characterKind, character);
  const player = attachments
    .filter((row) => row.record_id === character.id && row.relation === 'player')
    .map((row) => people.find((person) => person.id === row.person_id)?.display_name)
    .filter((name): name is string => Boolean(name))
    .join(', ');
  const titles = (recordIds: string[], kind: string, filter?: (row: RecordRow) => boolean) =>
    recordIds
      .map((recordId) => records.get(recordId))
      .filter((row): row is RecordRow => row?.kind === kind && (!filter || filter(row)))
      .map((row) => row.title)
      .join(', ');
  return {
    jmeno: character.title,
    hrac: player,
    funkce: data.post,
    dum: data.house_number,
    skupiny: titles(data.faction_ids, factionKind.kind),
    rasa: titles(data.definition_ids, definitionKind.kind, (row) => {
      const type = readData(definitionKind, row).type;
      return type === 'race' || type === 'class' || type === 'profession';
    }),
    dovednosti: titles(
      data.definition_ids,
      definitionKind.kind,
      (row) => readData(definitionKind, row).type === 'skill',
    ),
  };
}
