import {
  Anchor,
  Badge,
  Button,
  Group,
  MultiSelect,
  Paper,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { equipmentListKind, readData } from '@core/kinds';
import type { RecordRow, RegistrationRow } from '@core/model';
import { usePreview } from '../app/preview';
import { useTeam } from '../app/workspace';
import { NONE, useGameRecords, useRegistrations } from '../data/hooks';
import { GameGate, useRun } from '../tools/common';
import { useAllergenOptions } from './common';

/**
 * A player's or NPC actor's own registration: they read it and correct their
 * allergies and emergency contact (through update_my_registration()).
 */
export function MyRegistrationPage() {
  return <GameGate>{(game) => <Mine game={game} />}</GameGate>;
}

function Mine({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { me } = useTeam();
  const preview = usePreview();
  const personId = preview?.personId ?? me.person_id;
  const mine = (useRegistrations(game.id) ?? []).filter((row) => row.person_id === personId);
  const characters = useGameRecords('character', game.id) ?? NONE;
  const bring = (useGameRecords('equipment_list', game.id) ?? NONE).filter(
    (row) => readData(equipmentListKind, row).type === 'players_bring',
  );
  return (
    <Stack maw={640}>
      <Title order={2}>
        {t('myRegistration.title')} · {game.title}
      </Title>
      {mine.length === 0 ? (
        <Text c="dimmed">{t('myRegistration.none')}</Text>
      ) : (
        mine.map((row) => (
          <Paper key={`${row.id}:${String(row.rev)}`} withBorder p="md">
            <MyForm
              row={row}
              character={characters.find((c) => c.id === row.character_id) ?? null}
              readOnly={preview !== null}
            />
          </Paper>
        ))
      )}
      {bring.length > 0 && (
        <Stack gap={4}>
          <Title order={4}>{t('myRegistration.bring')}</Title>
          <Anchor component={Link} to="/vybaveni">
            {t('myRegistration.bringLink')}
          </Anchor>
        </Stack>
      )}
    </Stack>
  );
}

function MyForm({
  row,
  character,
  readOnly,
}: {
  row: RegistrationRow;
  character: RecordRow | null;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const run = useRun();
  const allergenOptions = useAllergenOptions();
  const [allergens, setAllergens] = useState(row.allergens);
  const [allergies, setAllergies] = useState(row.allergies);
  const [emergency, setEmergency] = useState(row.emergency_contact);
  return (
    <Stack>
      <Group justify="space-between">
        <Text fw={700}>{row.name}</Text>
        <Badge variant="light">
          {t('myRegistration.status', { status: t(`registrations.statuses.${row.status}`) })}
        </Badge>
      </Group>
      {character && (
        <Text size="sm">{t('myRegistration.character', { name: character.title })}</Text>
      )}
      <Text size="sm" c="dimmed">
        {t('myRegistration.intro')}
      </Text>
      <MultiSelect
        label={t('registrations.allergens')}
        data={allergenOptions}
        value={allergens}
        onChange={setAllergens}
        searchable
        clearable
        readOnly={readOnly}
      />
      <Textarea
        label={t('registrations.allergies')}
        autosize
        minRows={1}
        value={allergies}
        onChange={(event) => setAllergies(event.currentTarget.value)}
        maxLength={2000}
        readOnly={readOnly}
      />
      <TextInput
        label={t('registrations.emergency')}
        description={t('registrations.emergencyHint')}
        value={emergency}
        onChange={(event) => setEmergency(event.currentTarget.value)}
        maxLength={500}
        readOnly={readOnly}
      />
      {!readOnly && (
        <Group>
          <Button
            onClick={() =>
              void run(
                () =>
                  repo.updateMyRegistration(row.id, {
                    allergens,
                    allergies,
                    emergency_contact: emergency,
                  }),
                t('common.saved'),
              )
            }
          >
            {t('common.save')}
          </Button>
        </Group>
      )}
    </Stack>
  );
}
