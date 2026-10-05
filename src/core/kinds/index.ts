import { fileKind } from './file';
import { folderKind } from './folder';
import { gameKind } from './game';
import type { KindDefinition } from './registry';
import { worldKind } from './world';

export { fileKind, folderKind, gameKind, worldKind };
export { gameStatuses, type GameStatus } from './game';
export { readData, type KindDefinition } from './registry';

export const kinds: Record<string, KindDefinition> = {
  [worldKind.kind]: worldKind,
  [gameKind.kind]: gameKind,
  [folderKind.kind]: folderKind,
  [fileKind.kind]: fileKind,
};
