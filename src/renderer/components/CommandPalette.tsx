import { Spotlight, type SpotlightActionData } from '@mantine/spotlight';
import { IconHome, IconMap2, IconSearch, IconSettings, IconUsers } from '@tabler/icons-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { matchesQuery } from '@core/text';
import { useTeam, useWorkspace } from '../app/workspace';

/** Ctrl+K: jump to pages and records. Search grows into full text in M3. */
export function CommandPalette() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { cache } = useWorkspace();
  const { team, isOrganizer } = useTeam();
  const [query, setQuery] = useState('');

  const records = useLiveQuery(
    async () =>
      (await cache.records.where('team_id').equals(team.id).toArray()).filter(
        (r) => r.deleted_at === null,
      ),
    [cache, team.id],
  );

  const actions = useMemo<SpotlightActionData[]>(() => {
    const pages: SpotlightActionData[] = [
      {
        id: 'p-home',
        label: t('nav.home'),
        group: t('palette.pages'),
        leftSection: <IconHome size={16} />,
        onClick: () => void navigate('/'),
      },
      {
        id: 'p-worlds',
        label: t('nav.worlds'),
        group: t('palette.pages'),
        leftSection: <IconMap2 size={16} />,
        onClick: () => void navigate('/svety'),
      },
      ...(isOrganizer
        ? [
            {
              id: 'p-people',
              label: t('nav.people'),
              group: t('palette.pages'),
              leftSection: <IconUsers size={16} />,
              onClick: () => void navigate('/lide'),
            },
          ]
        : []),
      {
        id: 'p-settings',
        label: t('nav.settings'),
        group: t('palette.pages'),
        leftSection: <IconSettings size={16} />,
        onClick: () => void navigate('/nastaveni'),
      },
    ];
    const recordActions: SpotlightActionData[] = (records ?? [])
      .filter((record) => record.kind === 'world' || record.kind === 'game')
      .map((record) => ({
        id: record.id,
        label: record.title,
        description: record.kind === 'world' ? t('worlds.world') : t('worlds.game'),
        group: t('nav.worlds'),
        onClick: () => void navigate(`/svety/${record.id}`),
      }));
    const all = [...pages, ...recordActions];
    return query.trim()
      ? all.filter((action) => matchesQuery(action.label ?? '', query))
      : all.slice(0, 30);
  }, [records, query, t, navigate, isOrganizer]);

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
      searchProps={{ leftSection: <IconSearch size={18} />, placeholder: t('palette.placeholder') }}
    />
  );
}
