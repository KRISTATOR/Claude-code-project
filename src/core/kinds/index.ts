import {
  blockKind,
  characterKind,
  characterProfileKind,
  definitionKind,
  factionKind,
  npcAppearanceKind,
  npcKind,
  phaseKind,
  relationshipKind,
  sheetTemplateKind,
} from './characters';
import { fileKind } from './file';
import { folderKind } from './folder';
import { gameKind } from './game';
import {
  beatKind,
  canonEntryKind,
  clueKind,
  glossaryTermKind,
  historyEventKind,
  hookKind,
  issueKind,
  pageKind,
  plotThreadKind,
  questKind,
  ruleSectionKind,
  rulebookKind,
  rulebookVersionKind,
} from './lore';
import type { KindDefinition } from './registry';
import { worldKind } from './world';

export { fileKind, folderKind, gameKind, worldKind };
export * from './characters';
export * from './lore';
export { gameStatuses, type GameStatus } from './game';
export { readData, readSecret, type KindDefinition } from './registry';

export const kinds: Record<string, KindDefinition> = {
  [worldKind.kind]: worldKind,
  [gameKind.kind]: gameKind,
  [folderKind.kind]: folderKind,
  [fileKind.kind]: fileKind,
  [sheetTemplateKind.kind]: sheetTemplateKind,
  [characterKind.kind]: characterKind,
  [characterProfileKind.kind]: characterProfileKind,
  [factionKind.kind]: factionKind,
  [relationshipKind.kind]: relationshipKind,
  [npcKind.kind]: npcKind,
  [npcAppearanceKind.kind]: npcAppearanceKind,
  [phaseKind.kind]: phaseKind,
  [blockKind.kind]: blockKind,
  [definitionKind.kind]: definitionKind,
  [pageKind.kind]: pageKind,
  [canonEntryKind.kind]: canonEntryKind,
  [historyEventKind.kind]: historyEventKind,
  [beatKind.kind]: beatKind,
  [plotThreadKind.kind]: plotThreadKind,
  [clueKind.kind]: clueKind,
  [questKind.kind]: questKind,
  [hookKind.kind]: hookKind,
  [issueKind.kind]: issueKind,
  [rulebookKind.kind]: rulebookKind,
  [ruleSectionKind.kind]: ruleSectionKind,
  [glossaryTermKind.kind]: glossaryTermKind,
  [rulebookVersionKind.kind]: rulebookVersionKind,
};
