import { gameKind } from './game';
import type { KindDefinition } from './registry';
import { worldKind } from './world';

export { gameKind, worldKind };
export { gameStatuses, type GameStatus } from './game';
export { readData, type KindDefinition } from './registry';

export const kinds: Record<string, KindDefinition> = {
  [worldKind.kind]: worldKind,
  [gameKind.kind]: gameKind,
};
