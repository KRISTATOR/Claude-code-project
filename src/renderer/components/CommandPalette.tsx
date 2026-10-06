import { Spotlight, type SpotlightActionData } from '@mantine/spotlight';
import { IconSearch } from '@tabler/icons-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { matchesQuery } from '@core/text';
import { recordLink } from '../app/links';
import { useTeamRecords } from '../data/hooks';

export interface PaletteItem {
  to: string;
  label: string;
  icon: ReactNode;
}

const RECORD_KINDS = new Set([
  'world',
  'game',
  'character',
  'npc',
  'faction',
  'definition',
  'file',
  'folder',
  'phase',
]);

/** Ctrl+K: jump to pages and records (what you can see). */
export function CommandPalette({ pages }: { pages: PaletteItem[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const records = useTeamRecords((row) => RECORD_KINDS.has(row.kind), 'palette');

  const actions = useMemo<SpotlightActionData[]>(() => {
    const pageActions: SpotlightActionData[] = pages.map((page) => ({
      id: `page:${page.to}`,
      label: page.label,
      group: t('palette.pages'),
      leftSection: page.icon,
      onClick: () => void navigate(page.to),
    }));
    const recordActions: SpotlightActionData[] = (records ?? []).map((record) => ({
      id: record.id,
      label: record.title,
      description: t(`kinds.${record.kind}`, { defaultValue: record.kind }),
      group: t('palette.records'),
      onClick: () => void navigate(recordLink(record)),
    }));
    const all = [...pageActions, ...recordActions];
    return query.trim()
      ? all.filter((action) => matchesQuery(action.label ?? '', query)).slice(0, 50)
      : pageActions;
  }, [records, query, t, navigate, pages]);

  return (
    <Spotlight
      actions={actions}
      shortcut={['mod + K']}
      query={query}
      onQueryChange={setQuery}
      filter={(_query, items) => items}
      nothingFound={t('palette.nothing')}
      highlightQuery
      scrollable
      maxHeight={420}
      searchProps={{
        leftSection: <IconSearch size={18} />,
        placeholder: t('palette.placeholder'),
        // Enter with nothing highlighted opens the first result.
        onKeyDown: (event) => {
          if (event.key !== 'Enter') return;
          const list = event.currentTarget.closest('.mantine-Spotlight-content');
          if (list?.querySelector('.mantine-Spotlight-action[data-selected]')) return;
          const first = list?.querySelector<HTMLButtonElement>('.mantine-Spotlight-action');
          if (!first) return;
          event.preventDefault();
          first.click();
        },
      }}
    />
  );
}
