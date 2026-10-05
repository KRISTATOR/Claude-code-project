import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  CopyButton,
  Group,
  NumberInput,
  Paper,
  PasswordInput,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconCheck, IconCopy, IconKey, IconUserMinus } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@core/format';
import { memberRoles, type MemberRole } from '@core/model';
import { errorMessage } from '../../components/errors';
import { notifyError, notifySuccess } from '../../components/notify';
import { useInvites, useMembers, usePeople } from '../../data/hooks';
import { useTeam, useWorkspace } from '../workspace';

export function PeoplePage() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Title order={2}>{t('people.title')}</Title>
      <Tabs defaultValue="members" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="members">{t('people.members')}</Tabs.Tab>
          <Tabs.Tab value="roster">{t('people.roster')}</Tabs.Tab>
          <Tabs.Tab value="invites">{t('people.invites')}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="members" pt="md">
          <Members />
        </Tabs.Panel>
        <Tabs.Panel value="roster" pt="md">
          <Roster />
        </Tabs.Panel>
        <Tabs.Panel value="invites" pt="md">
          <Invites />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

function useRun() {
  const { t } = useTranslation();
  const { refresh } = useWorkspace();
  return async (action: () => Promise<unknown>, success?: string) => {
    try {
      await action();
      if (success) notifySuccess(success);
      await refresh();
    } catch (error) {
      const message = errorMessage(t, error);
      notifyError(/at least one organizer/.test(message) ? t('people.lastOrganizer') : message);
    }
  };
}

function Members() {
  const { t } = useTranslation();
  const { repo, canEdit, me } = useTeam();
  const members = useMembers() ?? [];
  const people = usePeople() ?? [];
  const run = useRun();
  const nameOf = (personId: string) =>
    people.find((person) => person.id === personId)?.display_name ?? '?';

  function setPassword(userId: string, name: string) {
    let password = '';
    modals.openConfirmModal({
      title: `${t('people.tempPassword')}: ${name}`,
      children: (
        <PasswordInput
          data-autofocus
          label={t('people.tempPasswordLabel')}
          onChange={(event) => {
            password = event.currentTarget.value;
          }}
        />
      ),
      labels: { confirm: t('common.save'), cancel: t('common.cancel') },
      onConfirm: () => {
        if (password.length < 8) {
          notifyError(t('auth.errors.weak'));
          return;
        }
        repo.setTemporaryPassword(userId, password).then(
          () => notifySuccess(t('people.tempPasswordDone')),
          (error: unknown) =>
            notifyError(t('people.tempPasswordUnavailable', { message: errorMessage(t, error) })),
        );
      },
    });
  }

  const rows = [...members].sort((a, b) =>
    nameOf(a.person_id).localeCompare(nameOf(b.person_id), 'cs'),
  );
  return (
    <Table striped highlightOnHover data-testid="members-table">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{t('people.name')}</Table.Th>
          <Table.Th>{t('people.role')}</Table.Th>
          <Table.Th />
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((member) => {
          const name = nameOf(member.person_id);
          const isMe = member.user_id === me.user_id;
          return (
            <Table.Tr key={member.user_id}>
              <Table.Td>
                {name}{' '}
                {isMe && (
                  <Text span c="dimmed" size="sm">
                    {t('people.you')}
                  </Text>
                )}
              </Table.Td>
              <Table.Td>
                <Select
                  size="xs"
                  w={220}
                  aria-label={t('people.role')}
                  data={memberRoles.map((role) => ({ value: role, label: t(`roles.${role}`) }))}
                  value={member.role}
                  disabled={!canEdit}
                  allowDeselect={false}
                  onChange={(value) => {
                    if (value && value !== member.role) {
                      void run(() => repo.setMemberRole(member.user_id, value), t('common.saved'));
                    }
                  }}
                />
              </Table.Td>
              <Table.Td>
                <Group gap={4} justify="flex-end">
                  {!isMe && (
                    <Tooltip label={t('people.tempPassword')}>
                      <ActionIcon
                        variant="subtle"
                        aria-label={t('people.tempPassword')}
                        disabled={!canEdit}
                        onClick={() => setPassword(member.user_id, name)}
                      >
                        <IconKey size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  <Tooltip label={t('people.remove')}>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label={t('people.remove')}
                      disabled={!canEdit}
                      onClick={() =>
                        modals.openConfirmModal({
                          title: t('people.remove'),
                          children: <Text size="sm">{t('people.removeConfirm', { name })}</Text>,
                          labels: { confirm: t('people.remove'), cancel: t('common.cancel') },
                          confirmProps: { color: 'red' },
                          onConfirm: () => void run(() => repo.removeMember(member.user_id)),
                        })
                      }
                    >
                      <IconUserMinus size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}

function Roster() {
  const { t } = useTranslation();
  const { repo, canEdit } = useTeam();
  const people = usePeople() ?? [];
  const [name, setName] = useState('');
  const run = useRun();

  return (
    <Stack>
      <Text size="sm" c="dimmed">
        {t('people.addPersonHint')}
      </Text>
      {canEdit && (
        <Group align="flex-end">
          <TextInput
            label={t('people.name')}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            maxLength={120}
          />
          <Button
            disabled={!name.trim()}
            onClick={() => {
              const value = name.trim();
              setName('');
              void run(() => repo.addPerson(value));
            }}
          >
            {t('people.addPerson')}
          </Button>
        </Group>
      )}
      <Table striped data-testid="roster-table">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t('people.name')}</Table.Th>
            <Table.Th>{t('people.account')}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {people.map((person) => (
            <Table.Tr key={person.id}>
              <Table.Td>{person.display_name}</Table.Td>
              <Table.Td>
                <Badge variant="light" color={person.user_id ? 'teal' : 'gray'}>
                  {person.user_id ? t('people.hasAccount') : t('people.noAccount')}
                </Badge>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function Invites() {
  const { t } = useTranslation();
  const { repo, canEdit } = useTeam();
  const invites = useInvites() ?? [];
  const people = usePeople() ?? [];
  const [role, setRole] = useState<MemberRole>('player');
  const [personId, setPersonId] = useState<string | null>(null);
  const [days, setDays] = useState<number>(14);
  const [uses, setUses] = useState<number>(1);
  const [created, setCreated] = useState<string | null>(null);
  const run = useRun();

  const [now] = useState(() => Date.now());
  const active = invites
    .filter(
      (invite) =>
        !invite.revoked_at &&
        new Date(invite.expires_at).getTime() > now &&
        invite.use_count < invite.max_uses,
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const unlinked = people.filter((person) => !person.user_id);

  return (
    <Stack>
      {canEdit && (
        <Paper withBorder p="md">
          <Stack>
            <Title order={5}>{t('people.newInvite')}</Title>
            <Group align="flex-end" grow>
              <Select
                label={t('people.inviteRole')}
                data={memberRoles.map((value) => ({ value, label: t(`roles.${value}`) }))}
                value={role}
                onChange={(value) => setRole(value ?? 'player')}
                allowDeselect={false}
              />
              <Select
                label={t('people.invitePerson')}
                description={t('people.invitePersonHint')}
                data={unlinked.map((person) => ({ value: person.id, label: person.display_name }))}
                value={personId}
                onChange={setPersonId}
                clearable
                searchable
              />
            </Group>
            <Group align="flex-end" grow>
              <NumberInput
                label={t('people.inviteDays')}
                min={1}
                max={365}
                value={days}
                onChange={(v) => setDays(Number(v) || 14)}
              />
              <NumberInput
                label={t('people.inviteUses')}
                min={1}
                max={200}
                value={uses}
                onChange={(v) => setUses(Number(v) || 1)}
              />
            </Group>
            <Button
              w="fit-content"
              onClick={() =>
                void run(async () => {
                  setCreated(await repo.createInvite({ role, personId, days, maxUses: uses }));
                })
              }
            >
              {t('people.createInvite')}
            </Button>
            {created && <InviteCode code={created} />}
          </Stack>
        </Paper>
      )}
      <Title order={5}>{t('people.active')}</Title>
      {active.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t('people.noInvites')}
        </Text>
      ) : (
        <Table striped>
          <Table.Tbody>
            {active.map((invite) => (
              <Table.Tr key={invite.id}>
                <Table.Td>
                  <Text ff="monospace">{invite.code}</Text>
                </Table.Td>
                <Table.Td>{t(`roles.${invite.role}`)}</Table.Td>
                <Table.Td>
                  {people.find((person) => person.id === invite.person_id)?.display_name ?? ''}
                </Table.Td>
                <Table.Td>
                  {t('people.expires', { date: formatDate(new Date(invite.expires_at)) })}
                </Table.Td>
                <Table.Td>
                  {t('people.uses', { used: invite.use_count, max: invite.max_uses })}
                </Table.Td>
                <Table.Td>
                  <Button
                    size="xs"
                    variant="subtle"
                    color="red"
                    disabled={!canEdit}
                    onClick={() => void run(() => repo.revokeInvite(invite.id))}
                  >
                    {t('people.revoke')}
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}

function InviteCode({ code }: { code: string }) {
  const { t } = useTranslation();
  const link = `zazemi://pozvanka/${code}`;
  return (
    <Alert
      color="teal"
      variant="light"
      title={t('people.inviteCreated')}
      data-testid="invite-created"
    >
      <Stack gap={4}>
        <Group gap="xs">
          <Text>{t('people.inviteCode')}:</Text>
          <Text ff="monospace" fw={700} data-testid="invite-code">
            {code}
          </Text>
          <Copy value={code} />
        </Group>
        <Group gap="xs">
          <Text>{t('people.inviteLink')}:</Text>
          <Text ff="monospace" size="sm">
            {link}
          </Text>
          <Copy value={link} />
        </Group>
        <Text size="sm" c="dimmed">
          {t('people.inviteShare')}
        </Text>
      </Stack>
    </Alert>
  );
}

function Copy({ value }: { value: string }) {
  const { t } = useTranslation();
  return (
    <CopyButton value={value}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? t('common.copied') : t('common.copy')}>
          <ActionIcon variant="subtle" onClick={copy} aria-label={t('common.copy')}>
            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          </ActionIcon>
        </Tooltip>
      )}
    </CopyButton>
  );
}
