import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { IconPlus, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { occupancy } from '@core/economy/sleeping';
import {
  phaseKind,
  readData,
  sleepingPlanKind,
  type SleepAssignment,
  type SleepPlace,
} from '@core/kinds';
import type { RecordRow } from '@core/model';
import { useTeam } from '../app/workspace';
import { NONE, useGameRecords, usePeople } from '../data/hooks';
import { phaseLabel } from '../print/pieces';
import { GameGate, useRun } from '../tools/common';

/** The sleeping plan ("Spaní"): who sleeps where, capacity, moves during the game. */
export function SleepingPage() {
  return <GameGate>{(game) => <Sleeping game={game} />}</GameGate>;
}

function Sleeping({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const plan = (useGameRecords('sleeping_plan', game.id) ?? NONE)[0];
  if (!plan) {
    return (
      <Stack align="flex-start">
        <Title order={2}>{t('sleeping.title')}</Title>
        <Text c="dimmed">{t('sleeping.none')}</Text>
        {canEdit && (
          <Button
            onClick={() =>
              void run(() =>
                repo.createRecord({
                  kind: 'sleeping_plan',
                  title: t('sleeping.title'),
                  game_id: game.id,
                }),
              )
            }
          >
            {t('sleeping.create')}
          </Button>
        )}
      </Stack>
    );
  }
  return <Plan key={`${plan.id}:${plan.rev}`} game={game} plan={plan} />;
}

function Plan({ game, plan }: { game: RecordRow; plan: RecordRow }) {
  const { t } = useTranslation();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const people = usePeople() ?? [];
  const phases = (useGameRecords('phase', game.id) ?? NONE)
    .slice()
    .sort((a, b) => readData(phaseKind, a).order - readData(phaseKind, b).order);
  const [fields, setFields] = useState(readData(sleepingPlanKind, plan));
  const [step, setStep] = useState('start');
  const draft: RecordRow = { ...plan, data: { ...plan.data, ...fields } };
  const steps = occupancy(draft, phases);
  const current = steps.find((item) => (item.phase_id ?? 'start') === step) ?? steps[0];
  const setPlace = (index: number, patch: Partial<SleepPlace>) =>
    setFields((value) => ({
      ...value,
      places: value.places.map((place, i) => (i === index ? { ...place, ...patch } : place)),
    }));
  const setAssignment = (index: number, patch: Partial<SleepAssignment>) =>
    setFields((value) => ({
      ...value,
      assignments: value.assignments.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  const nameOf = (assignment: SleepAssignment) =>
    people.find((person) => person.id === assignment.person_id)?.display_name ?? assignment.name;
  const placeOptions = fields.places.map((place) => ({
    value: place.id,
    label: place.name || '?',
  }));
  const phaseOptions = [
    { value: '', label: t('sleeping.fromStart') },
    ...phases.map((phase) => ({ value: phase.id, label: phaseLabel(phase) })),
  ];

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>
          {t('sleeping.title')} · {game.title}
        </Title>
        {canEdit && (
          <Button
            onClick={() =>
              void run(
                () => repo.updateRecord(plan.id, plan.rev, { data: { ...plan.data, ...fields } }),
                t('common.saved'),
              )
            }
          >
            {t('common.save')}
          </Button>
        )}
      </Group>
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Paper withBorder p="md">
          <Title order={5} mb="xs">
            {t('sleeping.places')}
          </Title>
          <Stack gap="xs">
            {fields.places.map((place, index) => (
              <Group key={place.id} gap="xs" wrap="nowrap">
                <TextInput
                  aria-label={t('sleeping.placeName')}
                  placeholder={t('sleeping.placeName')}
                  value={place.name}
                  onChange={(event) => setPlace(index, { name: event.currentTarget.value })}
                  flex={1}
                  readOnly={!canEdit}
                />
                <NumberInput
                  aria-label={t('sleeping.capacity')}
                  value={place.capacity}
                  min={0}
                  w={90}
                  onChange={(value) =>
                    setPlace(index, { capacity: Math.max(0, Math.round(Number(value) || 0)) })
                  }
                  readOnly={!canEdit}
                />
                {canEdit && (
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label={t('common.delete')}
                    onClick={() =>
                      setFields((value) => ({
                        ...value,
                        places: value.places.filter((_, i) => i !== index),
                      }))
                    }
                  >
                    <IconX size={14} />
                  </ActionIcon>
                )}
              </Group>
            ))}
            {canEdit && (
              <Group>
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconPlus size={12} />}
                  onClick={() =>
                    setFields((value) => ({
                      ...value,
                      places: [
                        ...value.places,
                        { id: crypto.randomUUID(), name: '', capacity: 4, map_object_id: null },
                      ],
                    }))
                  }
                >
                  {t('sleeping.addPlace')}
                </Button>
              </Group>
            )}
          </Stack>
          <Title order={5} mt="md" mb="xs">
            {t('sleeping.assignments')}
          </Title>
          <Stack gap="xs">
            {fields.assignments.map((assignment, index) => (
              <Group key={assignment.id} gap="xs" wrap="nowrap">
                <Select
                  aria-label={t('sleeping.person')}
                  placeholder={t('sleeping.person')}
                  data={people.map((person) => ({ value: person.id, label: person.display_name }))}
                  value={assignment.person_id}
                  onChange={(value) => setAssignment(index, { person_id: value })}
                  searchable
                  clearable
                  flex={1}
                  disabled={!canEdit}
                />
                {!assignment.person_id && (
                  <TextInput
                    aria-label={t('sleeping.name')}
                    placeholder={t('sleeping.name')}
                    value={assignment.name}
                    onChange={(event) => setAssignment(index, { name: event.currentTarget.value })}
                    flex={1}
                    readOnly={!canEdit}
                  />
                )}
                <Select
                  aria-label={t('sleeping.place')}
                  placeholder={t('sleeping.place')}
                  data={placeOptions}
                  value={assignment.place_id}
                  onChange={(value) => setAssignment(index, { place_id: value })}
                  w={140}
                  disabled={!canEdit}
                />
                <Select
                  aria-label={t('sleeping.fromPhase')}
                  data={phaseOptions}
                  value={assignment.from_phase_id ?? ''}
                  onChange={(value) => setAssignment(index, { from_phase_id: value || null })}
                  w={140}
                  allowDeselect={false}
                  disabled={!canEdit}
                />
                {canEdit && (
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label={t('common.delete')}
                    onClick={() =>
                      setFields((value) => ({
                        ...value,
                        assignments: value.assignments.filter((_, i) => i !== index),
                      }))
                    }
                  >
                    <IconX size={14} />
                  </ActionIcon>
                )}
              </Group>
            ))}
            {canEdit && (
              <Group>
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconPlus size={12} />}
                  onClick={() =>
                    setFields((value) => ({
                      ...value,
                      assignments: [
                        ...value.assignments,
                        {
                          id: crypto.randomUUID(),
                          person_id: null,
                          name: '',
                          place_id: value.places[0]?.id ?? null,
                          from_phase_id: null,
                        },
                      ],
                    }))
                  }
                >
                  {t('sleeping.addAssignment')}
                </Button>
              </Group>
            )}
          </Stack>
          <Textarea
            mt="md"
            label={t('sleeping.rules')}
            description={t('sleeping.rulesHint')}
            autosize
            minRows={2}
            value={fields.rules}
            onChange={(event) =>
              setFields((value) => ({ ...value, rules: event.currentTarget.value }))
            }
            readOnly={!canEdit}
          />
        </Paper>
        <Paper withBorder p="md">
          <SegmentedControl
            fullWidth
            value={step}
            onChange={setStep}
            data={[
              { value: 'start', label: t('sleeping.atStart') },
              ...phases.map((phase) => ({
                value: phase.id,
                label: readData(phaseKind, phase).label || phase.title,
              })),
            ]}
            mb="sm"
          />
          {current && current.over.length > 0 && (
            <Alert color="red" variant="light" mb="sm" data-testid="over-capacity">
              {t('sleeping.over', {
                places: current.over
                  .map((id) => fields.places.find((place) => place.id === id)?.name ?? '?')
                  .join(', '),
              })}
            </Alert>
          )}
          <Table data-testid="occupancy">
            <Table.Tbody>
              {fields.places.map((place) => {
                const ids = current?.places.get(place.id) ?? [];
                return (
                  <Table.Tr key={place.id}>
                    <Table.Td fw={600}>{place.name}</Table.Td>
                    <Table.Td>
                      <Badge
                        size="sm"
                        variant="light"
                        color={ids.length > place.capacity ? 'red' : 'teal'}
                      >
                        {ids.length}/{place.capacity}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {ids
                          .map((id) => fields.assignments.find((item) => item.id === id))
                          .filter((item): item is SleepAssignment => item !== undefined)
                          .map(nameOf)
                          .join(', ')}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
          {current && current.homeless.length > 0 && (
            <Text size="sm" c="orange" mt="xs">
              {t('sleeping.homeless', {
                names: current.homeless
                  .map((id) => fields.assignments.find((item) => item.id === id))
                  .filter((item): item is SleepAssignment => item !== undefined)
                  .map(nameOf)
                  .join(', '),
              })}
            </Text>
          )}
        </Paper>
      </SimpleGrid>
    </Stack>
  );
}
