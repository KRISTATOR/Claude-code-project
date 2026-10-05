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
    case 'page':
      return `/encyklopedie/${record.id}`;
    case 'canon_entry':
      return '/kanon';
    case 'history_event':
      return '/dejiny';
    case 'beat':
      return '/prubeh';
    case 'plot_thread':
      return `/zapletky/${record.id}`;
    case 'clue':
      return '/zapletky';
    case 'quest':
      return `/ukoly?q=${record.id}`;
    case 'hook':
      return record.parent_id ? `/postavy/${record.parent_id}` : '/zapletky';
    case 'issue':
      return '/problemy';
    case 'prop_document':
      return `/dokumenty/${record.id}`;
    case 'writer_profile':
      return `/pisatele/${record.id}`;
    case 'form_template':
      return `/formulare/${record.id}`;
    case 'location_sign':
      return '/cedule';
    case 'diary_design':
      return '/postavy?tab=denik';
    case 'archive':
    case 'archive_part':
      return '/archiv';
    case 'print_job':
      return '/tisk';
    case 'rulebook':
    case 'rule_section':
    case 'glossary_term':
    case 'rulebook_version':
      return '/pravidla';
    default:
      return '/';
  }
}
