import {
  Badge,
  Button,
  Grid,
  Group,
  NavLink,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { definitionKind, definitionTypes, readData } from '@core/kinds';
import type { RecordRow } from '@core/model';
import { useTeam } from '../app/workspace';
import { VisibilityEditor } from '../components/VisibilityEditor';
import { useCurrentGame, useRecord, useRecords } from '../data/hooks';
import { Field, useRun } from './common';

/** Races, classes, professions and skills, defined once per world. */
export function DefinitionsPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const { game } = useCurrentGame();
  const worlds = useRecords('world') ?? [];
  const [worldId, setWorldId] = useState<string | null>(game?.world_id ?? null);
  const world = worlds.find((row) => row.id === (worldId ?? game?.world_id)) ?? worlds[0];
  const definitions = (useRecords('definition') ?? []).filter((row) => row.world_id === world?.id);
  const selected = useRecord(id);

  if (!world) {
    return <Text c="dimmed">{t('definitions.noWorld')}</Text>;
  }

  return (
    <Grid gap="md">
      <Grid.Col span={{ base: 12, md: 4 }}>
        <Paper withBorder p="sm">
          <Stack gap="xs">
            <Title order={4}>{t('definitions.title')}</Title>
            <Select
              label={t('definitions.world')}
              data={worlds.map((row) => ({ value: row.id, label: row.title }))}
              value={world.id}
              onChange={setWorldId}
              allowDeselect={false}
            />
            {canEdit && (
              <Button
                size="xs"
                leftSection={<IconPlus size={14} />}
                onClick={() =>
                  void run(async () => {
                    const row = await repo.createRecord({
                      kind: 'definition',
                      title: t('definitions.newDefinition'),
                      world_id: world.id,
                      visibility: definitionKind.defaultVisibility,
                    });
                    void navigate(`/definice/${row.id}`);
                  })
                }
              >
                {t('definitions.newDefinition')}
              </Button>
            )}
            {definitions.length === 0 && (
              <Text size="sm" c="dimmed">
                {t('definitions.empty')}
              </Text>
            )}
            {definitionTypes.map((type) => {
              const list = definitions.filter((row) => readData(definitionKind, row).type === type);
              if (list.length === 0) return null;
              return (
                <Stack key={type} gap={0}>
                  <Text size="xs" c="dimmed" tt="uppercase" mt="xs">
                    {t(`definitions.types.${type}`)}
                  </Text>
                  {list.map((row) => (
                    <NavLink
                      key={row.id}
                      label={row.title}
                      active={row.id === id}
                      onClick={() => void navigate(`/definice/${row.id}`)}
                    />
                  ))}
                </Stack>
              );
            })}
          </Stack>
        </Paper>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 8 }}>
        {selected && selected.kind === 'definition' && (
          <DefinitionDetail key={`${selected.id}:${selected.rev}`} record={selected} />
        )}
      </Grid.Col>
    </Grid>
  );
}

function DefinitionDetail({ record }: { record: RecordRow }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { repo, canEdit, isOrganizer } = useTeam();
  const run = useRun();
  const data = readData(definitionKind, record);
  const [title, setTitle] = useState(record.title);
  const [fields, setFields] = useState(data);
  return (
    <Grid gap="md">
      <Grid.Col span={{ base: 12, lg: 7 }}>
        <Paper withBorder p="md">
          <Stack>
            <Group grow>
              <TextInput
                label={t('common.name')}
                value={title}
                readOnly={!canEdit}
                onChange={(event) => setTitle(event.currentTarget.value)}
              />
              <Select
                label={t('definitions.type')}
                data={definitionTypes.map((value) => ({
                  value,
                  label: t(`definitions.types.${value}`),
                }))}
                value={fields.type}
                onChange={(value) => value && setFields((f) => ({ ...f, type: value }))}
                allowDeselect={false}
                disabled={!canEdit}
              />
            </Group>
            <Field
              label={t('definitions.description')}
              value={fields.description}
              onValue={(value) => setFields((f) => ({ ...f, description: value }))}
            />
            <Field
              label={t('definitions.rules')}
              value={fields.rules}
              onValue={(value) => setFields((f) => ({ ...f, rules: value }))}
            />
            {canEdit && (
              <Group justify="space-between">
                <Button
                  onClick={() =>
                    void run(
                      () =>
                        repo.updateRecord(record.id, record.rev, {
                          title,
                          data: { ...record.data, ...fields },
                        }),
                      t('common.saved'),
                    )
                  }
                >
                  {t('common.save')}
                </Button>
                <Button
                  variant="subtle"
                  color="red"
                  leftSection={<IconTrash size={14} />}
                  onClick={() =>
                    void run(async () => {
                      await repo.trashRecord(record);
                      void navigate('/definice');
                    })
                  }
                >
                  {t('worlds.trash')}
                </Button>
              </Group>
            )}
            {!canEdit && (
              <Badge variant="light" w="fit-content">
                {t(`definitions.types.${data.type}`)}
              </Badge>
            )}
          </Stack>
        </Paper>
      </Grid.Col>
      <Grid.Col span={{ base: 12, lg: 5 }}>
        {isOrganizer && (
          <Paper withBorder p="md">
            <VisibilityEditor record={record} />
          </Paper>
        )}
      </Grid.Col>
    </Grid>
  );
}
