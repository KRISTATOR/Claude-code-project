import {
  Checkbox,
  Modal,
  Alert,
  Button,
  Group,
  Paper,
  PasswordInput,
  Progress,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import type { RestorePlan } from '@core/restore';
import {
  NotABackupError,
  openBackup,
  restorePlanFor,
  runRestore,
  type OpenedBackup,
} from '../../data/restore';
import { useEffect, useState } from 'react';
import { formatBytes } from '@core/format';
import { fileKind, readData } from '@core/kinds';
import { useDrive } from '../../drive/context';
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
      <Storage />
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

  const { files } = useDrive();
  const [progress, setProgress] = useState<string | null>(null);
  // Personal data stays out of backups unless explicitly ticked (the brief).
  const [withRegistrations, setWithRegistrations] = useState(false);

  async function exportBackup() {
    setBusy(true);
    let token: string | null = null;
    try {
      token = await window.zazemi.backup.begin(backupFileName(team.name, new Date(), 'zip'));
      if (!token) return;
      const byTeam = <T extends { team_id: string }>(rows: T[]) =>
        rows.filter((row) => row.team_id === team.id);
      const records = byTeam(await cache.records.toArray());
      const backup = buildBackup({
        appVersion: info.version,
        exportedAt: new Date(),
        team: { id: team.id, name: team.name },
        tables: {
          people: byTeam(await cache.people.toArray()),
          team_members: byTeam(await cache.members.toArray()),
          records,
          record_secrets: byTeam(await cache.secrets.toArray()),
          record_access: byTeam(await cache.access.toArray()),
          record_people: byTeam(await cache.recordPeople.toArray()),
          record_links: byTeam(await cache.links.toArray()),
          file_text: byTeam(await cache.fileText.toArray()),
          ...(withRegistrations
            ? { registrations: byTeam(await cache.registrations.toArray()) }
            : {}),
        },
      });
      await window.zazemi.backup.add(
        token,
        'zazemi.json',
        new TextEncoder().encode(JSON.stringify(backup, null, 2)),
      );
      // Current version of every file, stored by record id so names never collide.
      const fileRecords = records.filter(
        (row) => row.kind === 'file' && readData(fileKind, row).current_version_id,
      );
      let done = 0;
      for (const record of fileRecords) {
        setProgress(t('settings.backupProgress', { done, total: fileRecords.length }));
        const { data } = await files.getBytes(record);
        await window.zazemi.backup.add(token, `soubory/${record.id}`, data);
        done += 1;
      }
      const path = await window.zazemi.backup.finish(token);
      token = null;
      notifySuccess(t('settings.backupDone', { path }));
    } catch (error) {
      if (token) await window.zazemi.backup.abort(token);
      notifyError(errorMessage(t, error));
    } finally {
      setBusy(false);
      setProgress(null);
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
          <Checkbox
            label={t('settings.backupRegistrations')}
            description={t('settings.backupRegistrationsHint')}
            checked={withRegistrations}
            onChange={(event) => setWithRegistrations(event.currentTarget.checked)}
          />
          <Button
            w="fit-content"
            variant="light"
            loading={busy}
            onClick={() => void exportBackup()}
          >
            {t('settings.backupNow')}
          </Button>
          {progress && (
            <Text size="sm" c="dimmed">
              {progress}
            </Text>
          )}
          {canEdit && <RestoreBackup />}
        </Stack>
      )}
    </Section>
  );
}

/** Supabase Free tier: 1 GB of files (docs/PLAN.md §0). */
const STORAGE_LIMIT = 1_000_000_000;

function Storage() {
  const { t } = useTranslation();
  const { isOrganizer, canEdit } = useTeam();
  const { files } = useDrive();
  const [used, setUsed] = useState<number | null>(null);
  const [cacheSize, setCacheSize] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void window.zazemi.blobs.usage().then((size) => {
      if (!cancelled) setCacheSize(size);
    });
    if (isOrganizer) {
      files.usage().then(
        (bytes) => {
          if (!cancelled) setUsed(bytes);
        },
        () => undefined,
      );
    }
    return () => {
      cancelled = true;
    };
  }, [files, isOrganizer, reload]);

  async function prune() {
    setBusy(true);
    try {
      const freed = await files.prune();
      notifySuccess(t('storage.pruned', { size: formatBytes(freed) }));
      setReload((n) => n + 1);
    } catch (error) {
      notifyError(errorMessage(t, error));
    } finally {
      setBusy(false);
    }
  }

  const percent = used === null ? 0 : Math.round((used / STORAGE_LIMIT) * 100);
  return (
    <Section title={t('storage.title')}>
      {isOrganizer && used !== null && (
        <Stack gap={4}>
          <Text size="sm">
            {t('storage.used', { used: formatBytes(used), limit: formatBytes(STORAGE_LIMIT) })}
          </Text>
          <Progress
            value={Math.min(100, percent)}
            color={percent >= 90 ? 'red' : percent >= 70 ? 'orange' : 'teal'}
          />
          {percent >= 70 && (
            <Alert color={percent >= 90 ? 'red' : 'orange'} variant="light" p="xs">
              <Text size="sm">{t('storage.warning', { percent })}</Text>
            </Alert>
          )}
          <Text size="xs" c="dimmed">
            {t('storage.hint')}
          </Text>
          <Button
            w="fit-content"
            size="xs"
            variant="light"
            loading={busy}
            disabled={!canEdit}
            onClick={() => void prune()}
          >
            {t('storage.prune')}
          </Button>
        </Stack>
      )}
      {cacheSize !== null && (
        <Text size="xs" c="dimmed">
          {t('storage.cache', { size: formatBytes(cacheSize) })}
        </Text>
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

function RestoreBackup() {
  const { t } = useTranslation();
  const { client } = useBackend();
  const { team } = useTeam();
  const { refresh } = useWorkspace();
  const { files } = useDrive();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ opened: OpenedBackup; plan: RestorePlan } | null>(null);

  async function choose() {
    setBusy(true);
    try {
      const opened = await openBackup();
      if (!opened) return;
      const plan = await restorePlanFor(client, team.id, opened.backup);
      if (plan.records.length === 0 && plan.registrations.length === 0) {
        opened.close();
        notifySuccess(t('settings.restoreNothing'));
        return;
      }
      setPending({ opened, plan });
    } catch (error) {
      notifyError(
        error instanceof NotABackupError ? t('settings.notBackup') : errorMessage(t, error),
      );
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (!pending) return;
    const { opened, plan } = pending;
    setPending(null);
    setBusy(true);
    const id = notifications.show({ loading: true, autoClose: false, message: '' });
    try {
      const result = await runRestore(plan, {
        client,
        files,
        teamId: team.id,
        read: opened.read,
        onProgress: (done, total) =>
          notifications.update({ id, message: t('settings.restoreProgress', { done, total }) }),
      });
      notifications.hide(id);
      notifySuccess(t('settings.restoreDone', { records: result.records, files: result.files }));
      if (result.failedFiles.length > 0) {
        notifyError(t('settings.restoreFailedFiles', { names: result.failedFiles.join(', ') }));
      }
      await refresh({ reconcile: true });
    } catch (error) {
      notifications.hide(id);
      notifyError(errorMessage(t, error));
    } finally {
      opened.close();
      setBusy(false);
    }
  }

  return (
    <Stack gap="xs" mt="sm">
      <Text size="sm" c="dimmed">
        {t('settings.restoreHint')}
      </Text>
      <Button w="fit-content" variant="default" loading={busy} onClick={() => void choose()}>
        {t('settings.restore')}
      </Button>
      {pending && (
        <Modal
          opened
          onClose={() => {
            pending.opened.close();
            setPending(null);
          }}
          title={t('settings.restore')}
        >
          <Stack>
            <Text size="sm" data-testid="restore-summary">
              {t('settings.restoreSummary', {
                records: pending.plan.records.length,
                files: pending.plan.files.length,
                people: pending.plan.people.length,
                existing: pending.plan.existing,
              })}
            </Text>
            {!pending.plan.sameTeam && (
              <Alert color="orange" variant="light">
                {t('settings.restoreOtherTeam', { name: pending.opened.backup.team.name })}
              </Alert>
            )}
            {pending.plan.missingFiles > 0 && (
              <Text size="sm" c="dimmed">
                {t('settings.restoreMissingFiles', { count: pending.plan.missingFiles })}
              </Text>
            )}
            <Group justify="flex-end">
              <Button
                variant="default"
                onClick={() => {
                  pending.opened.close();
                  setPending(null);
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button onClick={() => void start()}>{t('settings.restoreStart')}</Button>
            </Group>
          </Stack>
        </Modal>
      )}
    </Stack>
  );
}
