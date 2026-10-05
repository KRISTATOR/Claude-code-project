import { describe, expect, it } from 'vitest';
import {
  canMoveInto,
  childrenOf,
  descendantsOf,
  parseScopeKey,
  pathTo,
  scopeKey,
  scopeOf,
  sharedWithoutFolder,
  type TreeItem,
} from './tree';

function item(
  id: string,
  kind: 'file' | 'folder',
  parent: string | null,
  extra: Partial<TreeItem> = {},
): TreeItem {
  return {
    id,
    kind,
    title: id,
    parent_id: parent,
    world_id: null,
    game_id: null,
    deleted_at: null,
    ...extra,
  };
}

const items: TreeItem[] = [
  item('Dopisy', 'folder', null, { game_id: 'g' }),
  item('Fáze III', 'folder', 'Dopisy', { game_id: 'g' }),
  item('dopis 12.docx', 'file', 'Fáze III', { game_id: 'g' }),
  item('Archiv.pdf', 'file', 'Dopisy', { game_id: 'g' }),
  item('Čtení.txt', 'file', null, { game_id: 'g' }),
  item('Banner.png', 'file', null, { game_id: 'g' }),
  item('Pravidla', 'folder', null),
  item('Smazaný.docx', 'file', null, { game_id: 'g', deleted_at: '2026-10-01' }),
  item('svet.docx', 'file', null, { world_id: 'w' }),
];

describe('drive tree', () => {
  it('lists children of a scope root: folders first, Czech order, no trash', () => {
    expect(childrenOf(items, { type: 'game', id: 'g' }, null).map((i) => i.id)).toEqual([
      'Dopisy',
      'Banner.png',
      'Čtení.txt',
    ]);
    expect(childrenOf(items, { type: 'team' }, null).map((i) => i.id)).toEqual(['Pravidla']);
    expect(childrenOf(items, { type: 'world', id: 'w' }, null).map((i) => i.id)).toEqual([
      'svet.docx',
    ]);
  });

  it('finds descendants and prevents moving a folder into itself', () => {
    expect(
      descendantsOf(items, 'Dopisy')
        .map((i) => i.id)
        .sort(),
    ).toEqual(['Archiv.pdf', 'Fáze III', 'dopis 12.docx']);
    expect(canMoveInto(items, 'Dopisy', 'Fáze III')).toBe(false);
    expect(canMoveInto(items, 'Dopisy', 'Dopisy')).toBe(false);
    expect(canMoveInto(items, 'Fáze III', 'Pravidla')).toBe(true);
    expect(canMoveInto(items, 'Fáze III', null)).toBe(true);
  });

  it('builds the breadcrumb path', () => {
    expect(pathTo(items, 'Fáze III').map((i) => i.id)).toEqual(['Dopisy', 'Fáze III']);
    expect(pathTo(items, null)).toEqual([]);
  });

  it('survives a cycle in corrupted data', () => {
    const loop = [item('a', 'folder', 'b'), item('b', 'folder', 'a')];
    expect(pathTo(loop, 'a').length).toBe(2);
    expect(descendantsOf(loop, 'a').length).toBe(2);
  });

  it('lists items whose folder is not visible', () => {
    const playerView = items.filter((i) => i.id === 'dopis 12.docx' || i.id === 'Čtení.txt');
    expect(sharedWithoutFolder(playerView).map((i) => i.id)).toEqual(['dopis 12.docx']);
  });

  it('round-trips scope keys', () => {
    for (const scope of [0, 6, 8].map((index) =>
      scopeOf(items[index] ?? items[0] ?? item('x', 'file', null)),
    )) {
      expect(parseScopeKey(scopeKey(scope))).toEqual(scope);
    }
    expect(parseScopeKey('nonsense')).toBeNull();
  });
});
