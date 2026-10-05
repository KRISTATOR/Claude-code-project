import { Button, Group, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { backupFileName, buildBackup } from '@core/backup';
import { errorMessage } from '../../components/errors';
import { notifyError, notifySuccess } from '../../components/notify';
import { ThemeSwitch } from '../../components/ThemeSwitch';
import { useUpdateStatus } from '../../components/UpdateBanner';
import { useBackend } from '../backend';
import { useSession } from '../session';
import { useTeam, useWorkspace } from '../workspace';

export function SettingsPage() {
  const { t } = useTranslation();
  return (
    <Stack maw={720}>
      <Title order={2}>{t('settings.title')}</Title>
      <Account />
      <Team />
      <Connection />
      <Section title={t('settings.appearance')}>
        <ThemeSwitch />
      </Section>
      <Updates />
    </Stack>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Title order={4}>{title}</Title>
        {children}
      </Stack>
    </Paper>
  );
}

function Account() {
  const { t } = useTranslation();
  const { client } = useBackend();
  const { signOut } = useSession();
  const { user, offline } = useWorkspace();
  const [password, setPassword] = useState('');

  async function changePassword() {
    if (password.length < 8) {
      notifyError(t('auth.errors.weak'));
      return;
    }
    const { error } = await client.auth.updateUser({ password });
    if (error) notifyError(errorMessage(t, error));
    else {
      setPassword('');
      notifySuccess(t('settings.passwordChanged'));
    }
  }

  return (
    <Section title={t('settings.account')}>
      <Text>{t('settings.signedInAs', { email: user.email })}</Text>
      <Group align="flex-end">
        <PasswordInput
          label={t('settings.newPassword')}
          value={password}
          onChange={(event) => setPassword(event.currentTarget.value)}
          autoComplete="new-password"
          disabled={offline}
        />
        <Button
          variant="light"
          disabled={offline || !password}
          onClick={() => void changePassword()}
        >
          {t('settings.changePassword')}
        </Button>
      </Group>
      <Group>
        <Button variant="default" onClick={() => void signOut()}>
          {t('settings.signOut')}
        </Button>
        <Button
          variant="subtle"
          color="red"
          onClick={() =>
            modals.openConfirmModal({
              title: t('settings.signOutWipe'),
              children: <Text size="sm">{t('settings.signOutWipeConfirm')}</Text>,
              labels: { confirm: t('settings.signOutWipe'), cancel: t('common.cancel') },
              confirmProps: { color: 'red' },
              onConfirm: () => void signOut({ wipe: true }),
            })
          }
        >
          {t('settings.signOutWipe')}
        </Button>
      </Group>
    </Section>
  );
}

function Team() {
  const { t } = useTranslation();
  const { team, repo, canEdit, isOrganizer } = useTeam();
  const { cache, refresh } = useWorkspace();
  const { info } = useBackend();
  const [name, setName] = useState(team.name);
  const [busy, setBusy] = useState(false);

  async function exportBackup() {
    setBusy(true);
    try {
      const byTeam = <T extends { team_id: string }>(rows: T[]) =>
        rows.filter((row) => row.team_id === team.id);
      const backup = buildBackup({
        appVersion: info.version,
        exportedAt: new Date(),
        team: { id: team.id, name: team.name },
        tables: {
          people: byTeam(await cache.people.toArray()),
          team_members: byTeam(await cache.members.toArray()),
          records: byTeam(await cache.records.toArray()),
          record_secrets: byTeam(await cache.secrets.toArray()),
          record_access: byTeam(await cache.access.toArray()),
          record_people: byTeam(await cache.recordPeople.toArray()),
          record_links: byTeam(await cache.links.toArray()),
        },
      });
      const result = await window.zazemi.dialogs.saveFile({
        defaultName: backupFileName(team.name, new Date()),
        filters: [{ name: 'JSON', extensions: ['json'] }],
        data: new TextEncoder().encode(JSON.stringify(backup, null, 2)),
      });
      if (result.saved) notifySuccess(t('settings.backupDone', { path: result.path }));
    } catch (error) {
      notifyError(errorMessage(t, error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title={t('settings.team')}>
      <Group align="flex-end">
        <TextInput
          label={t('settings.teamName')}
          value={name}
          readOnly={!canEdit}
          onChange={(event) => setName(event.currentTarget.value)}
          maxLength={120}
        />
        {canEdit && name.trim() !== team.name && (
          <Button
            onClick={() => {
              repo
                .renameTeam(name.trim())
                .then(() => refresh())
                .then(() => notifySuccess(t('common.saved')))
                .catch((error: unknown) => notifyError(errorMessage(t, error)));
            }}
          >
            {t('common.save')}
          </Button>
        )}
      </Group>
      {isOrganizer && (
        <Stack gap="xs">
          <Title order={5}>{t('settings.backup')}</Title>
          <Text size="sm" c="dimmed">
            {t('settings.backupHint')}
          </Text>
          <Button
            w="fit-content"
            variant="light"
            loading={busy}
            onClick={() => void exportBackup()}
          >
            {t('settings.backupNow')}
          </Button>
        </Stack>
      )}
    </Section>
  );
}

function Connection() {
  const { t } = useTranslation();
  const { config, info, disconnect } = useBackend();
  return (
    <Section title={t('settings.connection')}>
      <Text size="sm">{t('settings.server', { host: new URL(config.supabaseUrl).host })}</Text>
      {!info.configFromBuild && (
        <Button
          w="fit-content"
          variant="default"
          onClick={() =>
            modals.openConfirmModal({
              title: t('settings.disconnect'),
              children: <Text size="sm">{t('settings.disconnectConfirm')}</Text>,
              labels: { confirm: t('settings.disconnect'), cancel: t('common.cancel') },
              onConfirm: disconnect,
            })
          }
        >
          {t('settings.disconnect')}
        </Button>
      )}
    </Section>
  );
}

function Updates() {
  const { t } = useTranslation();
  const { info } = useBackend();
  const status = useUpdateStatus();
  const label =
    status.state === 'disabled'
      ? t('updates.disabled')
      : status.state === 'checking'
        ? t('updates.checking')
        : status.state === 'none'
          ? t('updates.none')
          : status.state === 'error'
            ? t('updates.error')
            : '';
  return (
    <Section title={t('settings.updates')}>
      <Text size="sm">{t('app.version', { version: info.version })}</Text>
      {label && (
        <Text size="sm" c="dimmed">
          {label}
        </Text>
      )}
      <Button
        w="fit-content"
        variant="default"
        disabled={status.state === 'disabled'}
        onClick={() => void window.zazemi.updates.check()}
      >
        {t('updates.check')}
      </Button>
    </Section>
  );
}
