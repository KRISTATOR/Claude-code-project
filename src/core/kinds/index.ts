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
import type { KindDefinition } from './registry';
import { worldKind } from './world';

export { fileKind, folderKind, gameKind, worldKind };
export * from './characters';
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
};
