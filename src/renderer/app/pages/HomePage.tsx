import { Alert, Anchor, Badge, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatDate } from '@core/format';
import { gameKind, npcKind, readData } from '@core/kinds';
import { useAttachments, useRecords } from '../../data/hooks';
import { useTeam, useWorkspace } from '../workspace';

export function HomePage() {
  const { t } = useTranslation();
  const { team, role, me, isOrganizer } = useTeam();
  const { cache } = useWorkspace();
  const games = useRecords('game') ?? [];
  const characters = useRecords('character') ?? [];
  const npcs = useRecords('npc') ?? [];
  const attachments = useAttachments() ?? [];
  const person = useLiveQuery(() => cache.people.get(me.person_id), [cache, me.person_id]);
  const mine = (relation: 'player' | 'actor') =>
    new Set(
      attachments
        .filter((row) => row.person_id === me.person_id && row.relation === relation)
        .map((row) => row.record_id),
    );
  const myCharacters = characters.filter((row) => mine('player').has(row.id));
  const myNpcs = npcs.filter((row) => mine('actor').has(row.id));

  return (
    <Stack>
      {person && <Title order={2}>{t('home.greeting', { name: person.display_name })}</Title>}
      <Text>{t('home.role', { team: team.name, role: t(`roles.${role}`) })}</Text>
      {isOrganizer && (
        <Alert variant="light" color="teal">
          {t('home.organizerTips')}
        </Alert>
      )}
      {myCharacters.length > 0 && (
        <Stack gap="xs" data-testid="my-characters">
          <Title order={4}>{t('characters.myCharacters')}</Title>
          {myCharacters.map((row) => (
            <Anchor key={row.id} component={Link} to={`/postavy/${row.id}`}>
              {row.title}
            </Anchor>
          ))}
        </Stack>
      )}
      {myNpcs.length > 0 && (
        <Stack gap="xs" data-testid="my-npcs">
          <Title order={4}>{t('npcs.myNpcs')}</Title>
          {myNpcs.map((row) => (
            <Anchor key={row.id} component={Link} to={`/cp/${row.id}`}>
              {row.title}
              {readData(npcKind, row).rank ? ` (${readData(npcKind, row).rank})` : ''}
            </Anchor>
          ))}
        </Stack>
      )}
      <Title order={4}>{t('home.games')}</Title>
      {games.length === 0 ? (
        <Text c="dimmed">{t('home.noGames')}</Text>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {games.map((game) => {
            const data = readData(gameKind, game);
            return (
              <Card key={game.id} withBorder component={Link} to={`/svety/${game.id}`}>
                <Group justify="space-between">
                  <Text fw={600}>{game.title}</Text>
                  <Badge variant="light">{t(`worlds.statuses.${data.status}`)}</Badge>
                </Group>
                {data.starts_on && (
                  <Text size="sm" c="dimmed">
                    {formatDate(new Date(`${data.starts_on}T12:00:00`))}
                    {data.venue ? ` · ${data.venue}` : ''}
                  </Text>
                )}
              </Card>
            );
          })}
        </SimpleGrid>
      )}
    </Stack>
  );
}
