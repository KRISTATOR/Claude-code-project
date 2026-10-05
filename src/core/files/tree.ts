import { compareCzech } from '../text';

/** The fields of a record the drive tree needs. */
export interface TreeItem {
  id: string;
  kind: string;
  title: string;
  parent_id: string | null;
  world_id: string | null;
  game_id: string | null;
  deleted_at: string | null;
}

/** Where a folder or file lives: the team's shared area, a world, or a game. */
export type Scope = { type: 'team' } | { type: 'world'; id: string } | { type: 'game'; id: string };

export function scopeOf(item: Pick<TreeItem, 'world_id' | 'game_id'>): Scope {
  if (item.game_id) return { type: 'game', id: item.game_id };
  if (item.world_id) return { type: 'world', id: item.world_id };
  return { type: 'team' };
}

export function sameScope(a: Scope, b: Scope): boolean {
  return a.type === b.type && (a.type === 'team' || (b.type !== 'team' && a.id === b.id));
}

export function scopeKey(scope: Scope): string {
  return scope.type === 'team' ? 'team' : `${scope.type}:${scope.id}`;
}

export function parseScopeKey(key: string): Scope | null {
  if (key === 'team') return { type: 'team' };
  const [type, id] = key.split(':');
  if ((type === 'world' || type === 'game') && id) return { type, id };
  return null;
}

const isDriveItem = (item: TreeItem) =>
  (item.kind === 'folder' || item.kind === 'file') && item.deleted_at === null;

/** Folders first, then files, each in Czech alphabetical order. */
export function sortDriveItems<T extends TreeItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    return compareCzech(a.title, b.title);
  });
}

export function childrenOf<T extends TreeItem>(
  items: T[],
  scope: Scope,
  parentId: string | null,
): T[] {
  return sortDriveItems(
    items.filter(
      (item) => isDriveItem(item) && item.parent_id === parentId && sameScope(scopeOf(item), scope),
    ),
  );
}

/** Every folder and file inside `folderId`, at any depth. */
export function descendantsOf<T extends TreeItem>(items: T[], folderId: string): T[] {
  const byParent = new Map<string, T[]>();
  for (const item of items) {
    if (!isDriveItem(item) || !item.parent_id) continue;
    const list = byParent.get(item.parent_id) ?? [];
    list.push(item);
    byParent.set(item.parent_id, list);
  }
  const result: T[] = [];
  const queue = [folderId];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const child of byParent.get(id) ?? []) {
      result.push(child);
      if (child.kind === 'folder') queue.push(child.id);
    }
  }
  return result;
}

/** A folder cannot be moved into itself or anything inside it. */
export function canMoveInto(
  items: TreeItem[],
  itemId: string,
  targetFolderId: string | null,
): boolean {
  if (targetFolderId === null) return true;
  if (targetFolderId === itemId) return false;
  return !descendantsOf(items, itemId).some((item) => item.id === targetFolderId);
}

/** Folders from the scope root down to `folderId` (inclusive). */
export function pathTo<T extends TreeItem>(items: T[], folderId: string | null): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const path: T[] = [];
  const seen = new Set<string>();
  let current = folderId ? byId.get(folderId) : undefined;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return path;
}

/**
 * Items the user can see whose folder they cannot see ("Sdíleno se mnou").
 * Visibility is per item (docs/PLAN.md §2.4), so this happens for players.
 */
export function sharedWithoutFolder<T extends TreeItem>(items: T[]): T[] {
  const present = new Set(items.filter(isDriveItem).map((item) => item.id));
  return sortDriveItems(
    items.filter(
      (item) => isDriveItem(item) && item.parent_id !== null && !present.has(item.parent_id),
    ),
  );
}
