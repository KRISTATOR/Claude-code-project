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
    case 'item':
    case 'currency':
    case 'transfer':
      return '/predmety';
    case 'recipe':
      return '/recepty';
    case 'loot_table':
      return '/nalezy';
    case 'inventory_item':
      return '/sklad';
    case 'map':
      return `/mapy/${record.id}`;
    case 'map_layer':
      return record.parent_id ? `/mapy/${record.parent_id}` : '/mapy';
    case 'travel_route':
      return '/cesty';
    case 'sleeping_plan':
      return '/spani';
    case 'ingredient':
    case 'dish':
    case 'meal':
      return '/jidlo';
    case 'budget_line':
      return '/rozpocet';
    case 'equipment_list':
      return '/vybaveni';
    case 'task':
      return '/ukolnicek';
    case 'note':
      return `/poznamky/${record.id}`;
    case 'tracker_definition':
      return '/stav';
    case 'survey':
      return `/zpetna-vazba/${record.id}`;
    case 'rulebook':
    case 'rule_section':
    case 'glossary_term':
    case 'rulebook_version':
      return '/pravidla';
    default:
      return '/';
  }
}
