import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  MultiSelect,
  Radio,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  visibilities,
  type MemberRole,
  type RecordAccessRow,
  type RecordRow,
  type Visibility,
} from '@core/model';
import { useTeam, useWorkspace } from '../app/workspace';
import { useAccess, usePeople } from '../data/hooks';
import { errorMessage } from './errors';
import { notifyError, notifySuccess } from './notify';
import { ReadersPanel } from './ReadersPanel';
import { useLiveQuery } from 'dexie-react-hooks';

export function VisibilityBadge({ visibility }: { visibility: Visibility }) {
  const { t } = useTranslation();
  const color = visibility === 'everyone' ? 'teal' : visibility === 'specific' ? 'blue' : 'gray';
  return (
    <Badge size="xs" variant="light" color={color}>
      {t(`visibility.badge.${visibility}`)}
    </Badge>
  );
}

/** Organizers choose who can see a record; everyone else just sees the badge. */
export function VisibilityEditor({ record }: { record: RecordRow }) {
  const { isOrganizer } = useTeam();
  const access = useAccess(record.id);
  if (!isOrganizer || access === undefined) return null;
  // Remount the form whenever the saved state changes (ours or someone else's).
  const key = `${record.id}:${record.rev}:${access.map((row) => row.id).join(',')}`;
  return <VisibilityForm key={key} record={record} access={access} />;
}

function VisibilityForm({ record, access }: { record: RecordRow; access: RecordAccessRow[] }) {
  const { t } = useTranslation();
  const { repo, canEdit } = useTeam();
  const { cache } = useWorkspace();
  const people = usePeople() ?? [];
  const savedPeople = access.flatMap((row) => (row.person_id ? [row.person_id] : []));
  const savedRoles = access.flatMap((row) => (row.member_role ? [row.member_role] : []));
  const [visibility, setVisibility] = useState<Visibility>(record.visibility);
  const [selected, setSelected] = useState<string[]>(savedPeople);
  const [roles, setRoles] = useState<MemberRole[]>(savedRoles);
  const [busy, setBusy] = useState(false);

  // A record inside a hidden game/world is hidden too (docs/PLAN.md §2.4).
  const containerHidden = useLiveQuery(async () => {
    const containerId = record.game_id ?? record.world_id;
    if (!containerId) return false;
    const container = await cache.records.get(containerId);
    if (!container) return false;
    if (container.visibility === 'organizers') return true;
    if (container.world_id) {
      const world = await cache.records.get(container.world_id);
      return world?.visibility === 'organizers';
    }
    return false;
  }, [cache, record.game_id, record.world_id]);

  const sameSet = (a: string[], b: string[]) =>
    JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  const dirty =
    visibility !== record.visibility ||
    (visibility === 'specific' && (!sameSet(selected, savedPeople) || !sameSet(roles, savedRoles)));

  async function save() {
    setBusy(true);
    try {
      await repo.setVisibility(
        record,
        visibility,
        visibility === 'specific' ? selected : [],
        visibility === 'specific' ? roles : [],
      );
      notifySuccess(t('common.saved'));
    } catch (error) {
      notifyError(errorMessage(t, error));
    } finally {
      setBusy(false);
    }
  }

  const toggleRole = (role: MemberRole, on: boolean) =>
    setRoles((current) =>
      on ? [...new Set([...current, role])] : current.filter((r) => r !== role),
    );

  return (
    <Stack gap="xs" data-testid="visibility-editor">
      <Title order={5}>{t('visibility.title')}</Title>
      <Radio.Group value={visibility} onChange={(value) => setVisibility(toVisibility(value))}>
        <Stack gap={6}>
          {visibilities.map((value) => (
            <Radio key={value} value={value} label={t(`visibility.${value}`)} disabled={!canEdit} />
          ))}
        </Stack>
      </Radio.Group>
      {visibility === 'specific' && (
        <Stack gap="xs">
          <MultiSelect
            label={t('visibility.people')}
            data={people.map((person) => ({ value: person.id, label: person.display_name }))}
            value={selected}
            onChange={setSelected}
            searchable
            disabled={!canEdit}
          />
          <Text size="sm" fw={500}>
            {t('visibility.groups')}
          </Text>
          <Group>
            <Checkbox
              label={t('visibility.allNpcs')}
              checked={roles.includes('npc')}
              disabled={!canEdit}
              onChange={(event) => toggleRole('npc', event.currentTarget.checked)}
            />
            <Checkbox
              label={t('visibility.allPlayers')}
              checked={roles.includes('player')}
              disabled={!canEdit}
              onChange={(event) => toggleRole('player', event.currentTarget.checked)}
            />
          </Group>
        </Stack>
      )}
      {dirty && (
        <Button
          size="xs"
          w="fit-content"
          loading={busy}
          disabled={!canEdit}
          onClick={() => void save()}
        >
          {t('visibility.save')}
        </Button>
      )}
      {containerHidden && record.visibility !== 'organizers' && (
        <Alert color="orange" variant="light" p="xs">
          <Text size="xs">{t('visibility.containerHidden')}</Text>
        </Alert>
      )}
      <ReadersPanel recordId={record.id} />
    </Stack>
  );
}

function toVisibility(value: string): Visibility {
  return visibilities.find((item) => item === value) ?? 'organizers';
}
