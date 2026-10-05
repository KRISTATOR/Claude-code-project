import { scopeKey, scopeOf } from '@core/files/tree';
import type { RecordRow } from '@core/model';

/** Where in the app a record is shown. */
export function recordLink(
  record: Pick<RecordRow, 'id' | 'kind' | 'parent_id' | 'world_id' | 'game_id'>,
): string {
  switch (record.kind) {
    case 'world':
    case 'game':
      return `/svety/${record.id}`;
    case 'file':
    case 'folder': {
      const params = new URLSearchParams({ s: scopeKey(scopeOf(record)) });
      if (record.parent_id) params.set('f', record.parent_id);
      params.set('sel', record.id);
      return `/disk?${params.toString()}`;
    }
    case 'character':
      return `/postavy/${record.id}`;
    case 'npc':
      return `/cp/${record.id}`;
    case 'npc_appearance':
      return record.parent_id ? `/cp/${record.parent_id}` : '/harmonogram';
    case 'faction':
      return `/skupiny/${record.id}`;
    case 'relationship':
      return '/vztahy';
    case 'phase':
    case 'block':
      return '/faze';
    case 'definition':
      return `/definice/${record.id}`;
    case 'sheet_template':
      return '/postavy?tab=sablona';
    default:
      return '/';
  }
}
