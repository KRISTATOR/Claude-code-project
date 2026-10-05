import { Badge, Group, Loader, Stack, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MemberRole } from '@core/model';
import { useTeam } from '../app/workspace';
import { errorMessage } from './errors';

interface Reader {
  person_id: string;
  display_name: string;
  role: MemberRole;
  has_account: boolean;
}

/** "Kdo to vidí?" – computed by the server with the same rule as RLS. */
export function ReadersPanel({ recordId }: { recordId: string }) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const [readers, setReaders] = useState<Reader[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    repo.readers(recordId).then(
      (rows) => {
        if (!cancelled) setReaders(rows);
      },
      (thrown: unknown) => {
        if (!cancelled) setError(errorMessage(t, thrown));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [repo, recordId, t]);

  return (
    <Stack gap={4} data-testid="readers-panel">
      <Text size="sm" fw={500}>
        {t('visibility.readers')}
      </Text>
      {error ? (
        <Text size="xs" c="dimmed">
          {error}
        </Text>
      ) : readers === null ? (
        <Loader size="xs" />
      ) : (
        <Group gap={4}>
          {readers.map((reader) => (
            <Badge
              key={reader.person_id}
              variant={reader.role === 'organizer' ? 'outline' : 'light'}
              color={
                reader.role === 'organizer' ? 'gray' : reader.role === 'npc' ? 'grape' : 'blue'
              }
              title={reader.has_account ? undefined : t('visibility.noAccount')}
            >
              {reader.display_name}
              {reader.has_account ? '' : ' *'}
            </Badge>
          ))}
        </Group>
      )}
      <Text size="xs" c="dimmed">
        {t('visibility.readersHint')}
      </Text>
    </Stack>
  );
}
