import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  Menu,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import {
  IconDots,
  IconDownload,
  IconExternalLink,
  IconEye,
  IconLockOpen,
  IconPin,
  IconPinnedOff,
  IconRestore,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatBytes, formatDateTime } from '@core/format';
import { officeAppOf } from '@core/files/names';
import {
  canMoveInto,
  descendantsOf,
  parseScopeKey,
  pathTo,
  scopeKey,
  scopeOf,
  type Scope,
} from '@core/files/tree';
import { fileKind, readData } from '@core/kinds';
import { isLockFresh, type FileVersionRow, type RecordRow } from '@core/model';
import { compareCzech } from '@core/text';
import { useTeam, useWorkspace } from '../app/workspace';
import { errorMessage } from '../components/errors';
import { notifyError, notifySuccess } from '../components/notify';
import { VisibilityEditor } from '../components/VisibilityEditor';
import { LockedError } from '../data/files';
import { usePeople } from '../data/hooks';
import { useDrive, useEditSessions } from './context';
import { fileIcon, useDriveItems, useLocks, useNow } from './DrivePage';
import { FilePreview } from './previews/FilePreview';

export function DetailPanel({
  record,
  onClose,
  onTrashed,
}: {
  record: RecordRow;
  onClose: () => void;
  onTrashed: () => void;
}) {
  const { t } = useTranslation();
  const { canEdit, me, repo } = useTeam();
  const { files, office } = useDrive();
  const sessions = useEditSessions();
  const locks = useLocks();
  const now = useNow();
  const items = useDriveItems() ?? [];
  const isFile = record.kind === 'file';
  const info = isFile ? readData(fileKind, record) : null;
  const lock = locks.get(record.id);
  const lockedByOther = lock !== undefined && lock.user_id !== me.user_id && isLockFresh(lock, now);
  const editing = sessions.some((session) => session.fileId === record.id);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    try {
      await action();
    } catch (error) {
      if (error instanceof LockedError) notifyError(t('drive.lockedError', { name: error.holder }));
      else notifyError(errorMessage(t, error));
    } finally {
      setBusy(null);
    }
  }

  const openForEdit = () =>
    run('edit', async () => {
      try {
        await office.openForEdit(record);
      } catch (error) {
        if (error instanceof LockedError) throw error;
        if (error instanceof Error && !('kind' in error))
          throw new Error(t('drive.noApp', { message: error.message }), { cause: error });
        throw error;
      }
    });

  const openReadOnly = (version?: FileVersionRow) =>
    run('view', async () => {
      const { sha } = await files.getBytes(record, version);
      const name = version
        ? record.title.replace(/(\.[^.]+)?$/, ` (verze ${version.no})$1`)
        : record.title;
      const result = await window.zazemi.office.openReadOnly({ fileId: record.id, name, sha });
      if (!result.ok) throw new Error(t('drive.noApp', { message: result.message }));
    });

  const saveCopy = () =>
    run('download', async () => {
      const { data } = await files.getBytes(record);
      const result = await window.zazemi.dialogs.saveFile({
        defaultName: record.title,
        filters: [],
        data,
      });
      if (result.saved) notifySuccess(result.path);
    });

  function rename() {
    let name = record.title;
    modals.openConfirmModal({
      title: t('drive.rename'),
      children: (
        <TextInput
          data-autofocus
          label={t('drive.name')}
          defaultValue={name}
          onChange={(event) => {
            name = event.currentTarget.value;
          }}
        />
      ),
      labels: { confirm: t('common.save'), cancel: t('common.cancel') },
      onConfirm: () =>
        void run('rename', async () => {
          await files.rename(record, name);
        }),
    });
  }

  function trash() {
    modals.openConfirmModal({
      title: t('drive.trash'),
      children: <Text size="sm">{t('drive.trashConfirm', { title: record.title })}</Text>,
      labels: { confirm: t('drive.trash'), cancel: t('common.cancel') },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        void run('trash', async () => {
          // A folder goes to the trash with everything inside it, all at the same moment.
          const at = new Date().toISOString();
          const inside = record.kind === 'folder' ? descendantsOf(items, record.id) : [];
          for (const item of [...inside].reverse())
            await repo.updateRecord(item.id, item.rev, { deleted_at: at });
          await repo.updateRecord(record.id, record.rev, { deleted_at: at });
          onTrashed();
        }),
    });
  }

  const toggleTemplate = () =>
    run('template', async () => {
      await repo.updateRecord(record.id, record.rev, {
        data: { ...record.data, is_template: !info?.is_template },
      });
    });

  const forceRelease = () =>
    modals.openConfirmModal({
      title: t('drive.forceRelease'),
      children: (
        <Text size="sm">{t('drive.forceReleaseConfirm', { name: lock?.display_name ?? '' })}</Text>
      ),
      labels: { confirm: t('drive.forceRelease'), cancel: t('common.cancel') },
      confirmProps: { color: 'orange' },
      onConfirm: () => void run('release', () => files.forceRelease(record.id)),
    });

  return (
    <Paper withBorder p="sm" h="100%" data-testid="detail-panel">
      <ScrollArea h="100%">
        <Stack gap="sm">
          <Group justify="space-between" wrap="nowrap">
            <Group gap="xs" wrap="nowrap" miw={0}>
              {fileIcon(record, 22)}
              <Title order={5} lineClamp={2}>
                {record.title}
              </Title>
            </Group>
            <ActionIcon variant="subtle" onClick={onClose} aria-label={t('common.close')}>
              <IconX size={16} />
            </ActionIcon>
          </Group>

          {isFile && info && (
            <Text size="xs" c="dimmed">
              {formatBytes(info.size)} · {t('drive.version', { no: info.current_version_no })} ·{' '}
              {formatDateTime(new Date(record.updated_at))}
            </Text>
          )}

          {lock && isLockFresh(lock, now) && (
            <Alert color="orange" variant="light" p="xs" data-testid="lock-alert">
              <Group justify="space-between" wrap="nowrap">
                <Text size="sm">
                  {lock.user_id === me.user_id
                    ? t('drive.lockedByMe')
                    : t('drive.lockedBy', { name: lock.display_name })}
                  {lock.machine ? ` (${lock.machine})` : ''}
                </Text>
                {canEdit && lockedByOther && (
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="orange"
                    leftSection={<IconLockOpen size={12} />}
                    onClick={forceRelease}
                  >
                    {t('drive.forceRelease')}
                  </Button>
                )}
              </Group>
            </Alert>
          )}

          {isFile && (
            <Group gap="xs">
              {canEdit && !lockedByOther && (
                <Tooltip label={t('drive.openHint')} multiline w={260}>
                  <Button
                    size="xs"
                    leftSection={<IconExternalLink size={14} />}
                    loading={busy === 'edit'}
                    disabled={editing}
                    onClick={() => void openForEdit()}
                  >
                    {officeAppOf(record.title) ? t('drive.open') : t('drive.open')}
                  </Button>
                </Tooltip>
              )}
              <Button
                size="xs"
                variant="default"
                leftSection={<IconEye size={14} />}
                loading={busy === 'view'}
                onClick={() => void openReadOnly()}
              >
                {t('drive.openReadOnly')}
              </Button>
              <Menu position="bottom-end">
                <Menu.Target>
                  <ActionIcon variant="default" size="lg" aria-label="…">
                    <IconDots size={16} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    leftSection={<IconDownload size={14} />}
                    onClick={() => void saveCopy()}
                  >
                    {t('drive.download')}
                  </Menu.Item>
                  {canEdit && (
                    <>
                      <Menu.Item onClick={rename}>{t('drive.rename')}</Menu.Item>
                      <MoveItem record={record} onRun={run} />
                      <Menu.Item onClick={() => void toggleTemplate()}>
                        {info?.is_template ? t('drive.unmarkTemplate') : t('drive.markTemplate')}
                      </Menu.Item>
                      <Menu.Divider />
                      <Menu.Item
                        color="red"
                        leftSection={<IconTrash size={14} />}
                        onClick={trash}
                        disabled={lockedByOther || editing}
                      >
                        {t('drive.trash')}
                      </Menu.Item>
                    </>
                  )}
                </Menu.Dropdown>
              </Menu>
            </Group>
          )}

          {!isFile && canEdit && (
            <Group gap="xs">
              <Button size="xs" variant="default" onClick={rename}>
                {t('drive.rename')}
              </Button>
              <Menu>
                <Menu.Target>
                  <Button size="xs" variant="default">
                    {t('drive.move')}
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <MoveItem record={record} onRun={run} />
                </Menu.Dropdown>
              </Menu>
              <Button
                size="xs"
                variant="subtle"
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={trash}
              >
                {t('drive.trash')}
              </Button>
            </Group>
          )}

          {isFile && (
            <>
              <Divider label={t('drive.preview')} labelPosition="left" />
              <FilePreview record={record} />
              <Divider label={t('drive.versions')} labelPosition="left" />
              <Versions record={record} onOpen={(version) => void openReadOnly(version)} />
            </>
          )}

          <Divider />
          <VisibilityEditor record={record} />
          {record.kind === 'folder' && canEdit && <ApplyToContents folder={record} items={items} />}
        </Stack>
      </ScrollArea>
    </Paper>
  );
}

function MoveItem({
  record,
  onRun,
}: {
  record: RecordRow;
  onRun: (label: string, action: () => Promise<void>) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { files } = useDrive();
  const { cache } = useWorkspace();
  const { team } = useTeam();
  const items = useDriveItems() ?? [];
  const containers = useLiveQuery(
    async () =>
      (await cache.records.where('team_id').equals(team.id).toArray()).filter(
        (row) => (row.kind === 'world' || row.kind === 'game') && row.deleted_at === null,
      ),
    [cache, team.id],
  );

  function open() {
    const scopes = [
      { value: 'team', label: t('drive.team') },
      ...(containers ?? [])
        .sort((a, b) => compareCzech(a.title, b.title))
        .map((row) => ({ value: `${row.kind}:${row.id}`, label: row.title })),
    ];
    let scope = scopeKey(scopeOf(record));
    let folder: string | null = null;
    const folderOptions = (key: string) => {
      const parsed = parseScopeKey(key) ?? { type: 'team' as const };
      const folders = items.filter(
        (item) =>
          item.kind === 'folder' &&
          scopeKey(scopeOf(item)) === scopeKey(parsed) &&
          canMoveInto(items, record.id, item.id),
      );
      return [
        { value: '', label: t('drive.moveRoot') },
        ...folders
          .map((item) => ({
            value: item.id,
            label: pathTo(items, item.id)
              .map((p) => p.title)
              .join(' / '),
          }))
          .sort((a, b) => compareCzech(a.label, b.label)),
      ];
    };
    modals.openConfirmModal({
      title: t('drive.move'),
      children: (
        <MoveForm
          scopes={scopes}
          initialScope={scope}
          folderOptions={folderOptions}
          onChange={(s, f) => {
            scope = s;
            folder = f;
          }}
        />
      ),
      labels: { confirm: t('drive.move'), cancel: t('common.cancel') },
      onConfirm: () => {
        const target: Scope = parseScopeKey(scope) ?? { type: 'team' };
        void onRun('move', async () => {
          // Folders move with their contents (children keep their parent).
          const inside = record.kind === 'folder' ? descendantsOf(items, record.id) : [];
          await files.move(record, target, folder);
          for (const item of inside) {
            const fresh = await cache.records.get(item.id);
            if (fresh) await files.move(fresh, target, fresh.parent_id);
          }
        });
      },
    });
  }

  return <Menu.Item onClick={open}>{t('drive.move')}</Menu.Item>;
}

function MoveForm({
  scopes,
  initialScope,
  folderOptions,
  onChange,
}: {
  scopes: { value: string; label: string }[];
  initialScope: string;
  folderOptions: (scope: string) => { value: string; label: string }[];
  onChange: (scope: string, folder: string | null) => void;
}) {
  const { t } = useTranslation();
  const [scope, setScope] = useState(initialScope);
  const [folder, setFolder] = useState('');
  return (
    <Stack>
      <Select
        label={t('drive.moveTo')}
        data={scopes}
        value={scope}
        allowDeselect={false}
        onChange={(value) => {
          const next = value ?? 'team';
          setScope(next);
          setFolder('');
          onChange(next, null);
        }}
      />
      <Select
        data={folderOptions(scope)}
        value={folder}
        allowDeselect={false}
        searchable
        onChange={(value) => {
          setFolder(value ?? '');
          onChange(scope, value || null);
        }}
      />
    </Stack>
  );
}

function ApplyToContents({ folder, items }: { folder: RecordRow; items: RecordRow[] }) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const { cache } = useWorkspace();
  const inside = descendantsOf(items, folder.id);
  const [busy, setBusy] = useState(false);
  if (inside.length === 0) return null;

  async function apply() {
    setBusy(true);
    try {
      const access = await cache.access.where('record_id').equals(folder.id).toArray();
      const people = access.flatMap((row) => (row.person_id ? [row.person_id] : []));
      const roles = access.flatMap((row) => (row.member_role ? [row.member_role] : []));
      for (const item of inside) {
        const fresh = await cache.records.get(item.id);
        if (fresh) await repo.setVisibility(fresh, folder.visibility, people, roles);
      }
      notifySuccess(t('common.saved'));
    } catch (error) {
      notifyError(errorMessage(t, error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="xs" variant="light" loading={busy} onClick={() => void apply()} w="fit-content">
      {t('drive.applyToContents', { count: inside.length })}
    </Button>
  );
}

function Versions({
  record,
  onOpen,
}: {
  record: RecordRow;
  onOpen: (version: FileVersionRow) => void;
}) {
  const { t } = useTranslation();
  const { files } = useDrive();
  const { canEdit } = useTeam();
  const people = usePeople() ?? [];
  const { cache } = useWorkspace();
  const members = useLiveQuery(() => cache.members.toArray(), [cache]);
  const [versions, setVersions] = useState<FileVersionRow[] | null>(null);
  const [reload, setReload] = useState(0);
  const current = readData(fileKind, record).current_version_id;

  useEffect(() => {
    let cancelled = false;
    files.listVersions(record.id).then(
      (rows) => {
        if (!cancelled) setVersions(rows);
      },
      () => {
        if (!cancelled) setVersions([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [files, record.id, record.rev, reload]);

  const who = (userId: string | null) => {
    const member = members?.find((row) => row.user_id === userId);
    return people.find((person) => person.id === member?.person_id)?.display_name ?? '?';
  };

  if (versions === null) return <Loader size="xs" />;
  const hasConflicts = versions.some((version) => version.is_conflict);

  return (
    <Stack gap={4} data-testid="versions">
      {hasConflicts && (
        <Alert color="orange" variant="light" p="xs">
          <Text size="xs">{t('drive.conflictExplained')}</Text>
        </Alert>
      )}
      {versions.map((version) => (
        <Group key={version.id} justify="space-between" wrap="nowrap" data-testid="version-row">
          <Stack gap={0} miw={0}>
            <Group gap={4}>
              <Text size="sm" fw={500}>
                {t('drive.version', { no: version.no })}
              </Text>
              {version.id === current && (
                <Badge size="xs" color="teal" variant="light">
                  {t('drive.currentVersion')}
                </Badge>
              )}
              {version.is_conflict && (
                <Badge size="xs" color="orange" variant="light">
                  {t('drive.conflictVersion')}
                </Badge>
              )}
              {version.pinned && <IconPin size={12} />}
            </Group>
            <Text size="xs" c="dimmed" truncate>
              {t('drive.versionBy', {
                who: who(version.created_by),
                when: formatDateTime(new Date(version.created_at)),
              })}{' '}
              · {formatBytes(version.size)}
              {version.label ? ` · ${version.label}` : ''}
            </Text>
          </Stack>
          <Group gap={2} wrap="nowrap">
            <Tooltip label={t('drive.openVersion')}>
              <ActionIcon
                size="sm"
                variant="subtle"
                onClick={() => onOpen(version)}
                aria-label={t('drive.openVersion')}
              >
                <IconEye size={14} />
              </ActionIcon>
            </Tooltip>
            {canEdit && version.id !== current && (
              <Tooltip label={t('drive.restore')}>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  aria-label={t('drive.restore')}
                  onClick={() =>
                    modals.openConfirmModal({
                      title: t('drive.restore'),
                      children: (
                        <Text size="sm">{t('drive.restoreConfirm', { no: version.no })}</Text>
                      ),
                      labels: { confirm: t('drive.restore'), cancel: t('common.cancel') },
                      onConfirm: () => {
                        files
                          .restoreVersion(record, version)
                          .then(() => setReload((n) => n + 1))
                          .catch((error: unknown) => notifyError(errorMessage(t, error)));
                      },
                    })
                  }
                >
                  <IconRestore size={14} />
                </ActionIcon>
              </Tooltip>
            )}
            {canEdit && (
              <Tooltip label={version.pinned ? t('drive.unpin') : t('drive.pin')}>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  aria-label={version.pinned ? t('drive.unpin') : t('drive.pin')}
                  onClick={() => {
                    files
                      .setPinned(version, !version.pinned)
                      .then(() => setReload((n) => n + 1))
                      .catch((error: unknown) => notifyError(errorMessage(t, error)));
                  }}
                >
                  {version.pinned ? <IconPinnedOff size={14} /> : <IconPin size={14} />}
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </Group>
      ))}
    </Stack>
  );
}
