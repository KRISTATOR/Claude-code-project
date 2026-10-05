import { Badge, Group, Paper, Stack, Text, TextInput, Title, UnstyledButton } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { kinds } from '@core/kinds';
import { scopeKey, scopeOf } from '@core/files/tree';
import type { RecordRow } from '@core/model';
import { SearchIndex, type SearchDoc } from '@core/search';
import { fileIcon } from '../../drive/DrivePage';
import { useTeam, useWorkspace } from '../workspace';

function bodyOf(record: RecordRow, fileText: string | undefined): string {
  const fields = kinds[record.kind]?.searchFields ?? [];
  const parts = fields
    .map((field) => record.data[field])
    .filter((value): value is string => typeof value === 'string');
  if (fileText) parts.push(fileText);
  return parts.join('\n');
}

/** Builds the search index from the local cache (works offline). */
export function useSearchIndex():
  { index: SearchIndex; records: Map<string, RecordRow> } | undefined {
  const { cache } = useWorkspace();
  const { team } = useTeam();
  const data = useLiveQuery(async () => {
    const records = (await cache.records.where('team_id').equals(team.id).toArray()).filter(
      (row) => row.deleted_at === null,
    );
    const texts = await cache.fileText.where('team_id').equals(team.id).toArray();
    return { records, texts };
  }, [cache, team.id]);
  return useMemo(() => {
    if (!data) return undefined;
    const textByFile = new Map(data.texts.map((row) => [row.file_id, row.text]));
    const index = new SearchIndex();
    const docs: SearchDoc[] = data.records.map((record) => ({
      id: record.id,
      kind: record.kind,
      title: record.title,
      body: bodyOf(record, textByFile.get(record.id)),
    }));
    index.addAll(docs);
    return { index, records: new Map(data.records.map((record) => [record.id, record])) };
  }, [data]);
}

export function recordLink(record: RecordRow): string {
  if (record.kind === 'world' || record.kind === 'game') return `/svety/${record.id}`;
  if (record.kind === 'file' || record.kind === 'folder') {
    const params = new URLSearchParams({ s: scopeKey(scopeOf(record)) });
    if (record.parent_id) params.set('f', record.parent_id);
    params.set('sel', record.id);
    return `/disk?${params.toString()}`;
  }
  return '/';
}

export function SearchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const search = useSearchIndex();
  const hits = useMemo(() => (search ? search.index.search(query) : []), [search, query]);

  return (
    <Stack maw={900}>
      <Title order={2}>{t('search.title')}</Title>
      <TextInput
        leftSection={<IconSearch size={16} />}
        placeholder={t('search.placeholder')}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        autoFocus
        data-testid="search-input"
      />
      {query.trim() && (
        <Text size="sm" c="dimmed">
          {hits.length === 0 ? t('search.nothing') : t('search.results', { count: hits.length })}
        </Text>
      )}
      {hits.map((hit) => {
        const record = search?.records.get(hit.id);
        if (!record) return null;
        return (
          <UnstyledButton
            key={hit.id}
            onClick={() => void navigate(recordLink(record))}
            data-testid="search-hit"
          >
            <Paper withBorder p="sm">
              <Group gap="xs" wrap="nowrap">
                {fileIcon(record)}
                <Text fw={500} truncate>
                  {record.title}
                </Text>
                {record.kind !== 'file' && record.kind !== 'folder' && (
                  <Badge size="xs" variant="light">
                    {record.kind}
                  </Badge>
                )}
              </Group>
              {hit.snippet && (
                <Text size="sm" c="dimmed" lineClamp={2}>
                  {hit.snippet}
                </Text>
              )}
            </Paper>
          </UnstyledButton>
        );
      })}
    </Stack>
  );
}
