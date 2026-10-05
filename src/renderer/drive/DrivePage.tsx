import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Breadcrumbs,
  Button,
  Group,
  Menu,
  NavLink,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconChevronDown,
  IconFile,
  IconFileTypeDocx,
  IconFileTypePdf,
  IconFileTypePpt,
  IconFileTypeXls,
  IconFolder,
  IconFolderPlus,
  IconLock,
  IconPhoto,
  IconTemplate,
  IconUpload,
} from '@tabler/icons-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { formatBytes, formatDate, formatDateTime } from '@core/format';
import { extensionOf, MAX_FILE_BYTES } from '@core/files/names';
import {
  childrenOf,
  parseScopeKey,
  pathTo,
  sharedWithoutFolder,
  type Scope,
} from '@core/files/tree';
import { fileKind, readData } from '@core/kinds';
import { isLockFresh, type FileLockRow, type RecordRow } from '@core/model';
import { useTeam, useWorkspace } from '../app/workspace';
import { useTeamRecords } from '../data/hooks';
import { errorMessage } from '../components/errors';
import { notifyError } from '../components/notify';
import { VisibilityBadge } from '../components/VisibilityEditor';
import { FileTooLargeError } from '../data/files';
import { useDrive } from './context';
import { DetailPanel } from './DetailPanel';
import { fromDrop, fromInput, type PickedFile } from './dropped';
import { TemplateDialog } from './TemplateDialog';

const SHARED = 'shared';

export function fileIcon(record: Pick<RecordRow, 'kind' | 'title'>, size = 18) {
  if (record.kind === 'folder')
    return <IconFolder size={size} color="var(--mantine-color-yellow-6)" />;
  const ext = extensionOf(record.title);
  if (['docx', 'doc', 'dotx', 'odt'].includes(ext))
    return <IconFileTypeDocx size={size} color="var(--mantine-color-blue-6)" />;
  if (['xlsx', 'xls', 'xltx', 'ods', 'csv'].includes(ext))
    return <IconFileTypeXls size={size} color="var(--mantine-color-green-7)" />;
  if (['pptx', 'ppt'].includes(ext))
    return <IconFileTypePpt size={size} color="var(--mantine-color-orange-6)" />;
  if (ext === 'pdf') return <IconFileTypePdf size={size} color="var(--mantine-color-red-6)" />;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return <IconPhoto size={size} />;
  return <IconFile size={size} />;
}

export function useDriveItems() {
  return useTeamRecords((row) => row.kind === 'file' || row.kind === 'folder', 'drive');
}

export function useLocks(): Map<string, FileLockRow> {
  const { cache } = useWorkspace();
  const { team } = useTeam();
  const locks = useLiveQuery(
    () => cache.locks.where('team_id').equals(team.id).toArray(),
    [cache, team.id],
  );
  return useMemo(() => new Map((locks ?? []).map((lock) => [lock.file_id, lock])), [locks]);
}

export function DrivePage() {
  const [params, setParams] = useSearchParams();
  const items = useDriveItems();
  const scopeParam = params.get('s') ?? 'team';
  const folderId = params.get('f');
  const selectedId = params.get('sel');

  const navigate = (next: { s?: string; f?: string | null; sel?: string | null }) => {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (typeof value === 'string') merged.set(key, value);
      else merged.delete(key);
    }
    setParams(merged);
  };

  const selected = items?.find((item) => item.id === selectedId) ?? null;

  return (
    <Group align="flex-start" gap="md" wrap="nowrap" h="calc(100vh - 100px)">
      <ScopeNav
        current={scopeParam}
        items={items ?? []}
        onSelect={(s) => navigate({ s, f: null, sel: null })}
      />
      <Box flex={1} miw={0}>
        {scopeParam === SHARED ? (
          <SharedView
            items={items ?? []}
            selectedId={selectedId}
            onSelect={(sel) => navigate({ sel })}
          />
        ) : (
          <FolderView
            scope={parseScopeKey(scopeParam) ?? { type: 'team' }}
            folderId={folderId}
            items={items ?? []}
            selectedId={selectedId}
            onOpenFolder={(f) => navigate({ f, sel: null })}
            onSelect={(sel) => navigate({ sel })}
          />
        )}
      </Box>
      {selected && (
        <Box w={400} miw={400} h="100%">
          <DetailPanel
            key={selected.id}
            record={selected}
            onClose={() => navigate({ sel: null })}
            onTrashed={() => navigate({ sel: null })}
          />
        </Box>
      )}
    </Group>
  );
}

function ScopeNav({
  current,
  items,
  onSelect,
}: {
  current: string;
  items: RecordRow[];
  onSelect: (scope: string) => void;
}) {
  const { t } = useTranslation();
  const containers = useTeamRecords(
    (row) => row.kind === 'world' || row.kind === 'game',
    'containers',
  );
  const worlds = (containers ?? []).filter((row) => row.kind === 'world');
  const games = (containers ?? []).filter((row) => row.kind === 'game');
  const orphanGames = games.filter((game) => !worlds.some((world) => world.id === game.world_id));
  const shared = sharedWithoutFolder(items).length > 0;

  return (
    <Paper withBorder p="xs" w={220} miw={220} h="100%">
      <ScrollArea h="100%">
        <Title order={5} px="xs" pb="xs">
          {t('drive.title')}
        </Title>
        <NavLink
          label={t('drive.team')}
          active={current === 'team'}
          onClick={() => onSelect('team')}
        />
        {worlds.map((world) => (
          <NavLink
            key={world.id}
            label={world.title}
            active={current === `world:${world.id}`}
            defaultOpened
            onClick={() => onSelect(`world:${world.id}`)}
          >
            {games
              .filter((game) => game.world_id === world.id)
              .map((game) => (
                <NavLink
                  key={game.id}
                  label={game.title}
                  active={current === `game:${game.id}`}
                  onClick={() => onSelect(`game:${game.id}`)}
                />
              ))}
          </NavLink>
        ))}
        {orphanGames.map((game) => (
          <NavLink
            key={game.id}
            label={game.title}
            active={current === `game:${game.id}`}
            onClick={() => onSelect(`game:${game.id}`)}
          />
        ))}
        {shared && (
          <NavLink
            label={t('drive.shared')}
            active={current === SHARED}
            onClick={() => onSelect(SHARED)}
          />
        )}
      </ScrollArea>
    </Paper>
  );
}

function SharedView({
  items,
  selectedId,
  onSelect,
}: {
  items: RecordRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Stack>
      <Title order={4}>{t('drive.shared')}</Title>
      <Text size="sm" c="dimmed">
        {t('drive.sharedHint')}
      </Text>
      <ItemTable
        rows={sharedWithoutFolder(items)}
        selectedId={selectedId}
        onSelect={onSelect}
        onOpen={onSelect}
      />
    </Stack>
  );
}

function FolderView({
  scope,
  folderId,
  items,
  selectedId,
  onOpenFolder,
  onSelect,
}: {
  scope: Scope;
  folderId: string | null;
  items: RecordRow[];
  selectedId: string | null;
  onOpenFolder: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { canEdit, team } = useTeam();
  const { cache } = useWorkspace();
  const { files } = useDrive();
  const [dragging, setDragging] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const rows = childrenOf(items, scope, folderId);
  const path = pathTo(items, folderId);
  const scopeTitle = useLiveQuery(
    async () =>
      scope.type === 'team' ? team.name : ((await cache.records.get(scope.id))?.title ?? ''),
    [cache, scope, team.name],
  );

  const { repo } = useTeam();

  /** New items start with the visibility of the folder they are created in. */
  async function inheritVisibility(parentId: string | null, created: RecordRow) {
    const parent = parentId ? await cache.records.get(parentId) : undefined;
    if (!parent || parent.visibility === 'organizers') return;
    const access = await cache.access.where('record_id').equals(parent.id).toArray();
    const fresh = (await cache.records.get(created.id)) ?? created;
    await repo.setVisibility(
      fresh,
      parent.visibility,
      access.flatMap((row) => (row.person_id ? [row.person_id] : [])),
      access.flatMap((row) => (row.member_role ? [row.member_role] : [])),
    );
  }

  function createFolder() {
    let name: string = t('drive.newFolder');
    modals.openConfirmModal({
      title: t('drive.newFolder'),
      children: (
        <TextInput
          data-autofocus
          label={t('drive.folderName')}
          defaultValue={name}
          onChange={(event) => {
            name = event.currentTarget.value;
          }}
        />
      ),
      labels: { confirm: t('common.create'), cancel: t('common.cancel') },
      onConfirm: () => {
        void (async () => {
          try {
            const folder = await files.createFolder(
              scope,
              folderId,
              name.trim() || t('drive.newFolder'),
              'organizers',
            );
            await inheritVisibility(folderId, folder);
          } catch (error) {
            notifyError(errorMessage(t, error));
          }
        })();
      },
    });
  }

  async function upload(picked: PickedFile[]) {
    if (picked.length === 0) return;
    const id = notifications.show({
      loading: true,
      autoClose: false,
      withCloseButton: false,
      message: '',
    });
    const folderCache = new Map<string, string | null>([['', folderId]]);
    let done = 0;
    for (const { folders, file } of picked) {
      notifications.update({
        id,
        message: t('drive.uploading', { done: done + 1, total: picked.length, name: file.name }),
      });
      try {
        if (file.size > MAX_FILE_BYTES) throw new FileTooLargeError(file.name, file.size);
        // Recreate the dropped folder structure, reusing folders that exist.
        let parent: string | null = folderId;
        for (let depth = 1; depth <= folders.length; depth += 1) {
          const key = folders.slice(0, depth).join('/');
          const known = folderCache.get(key);
          if (known !== undefined) {
            parent = known;
            continue;
          }
          const name = folders[depth - 1] ?? '';
          const existing = childrenOf(await currentItems(), scope, parent).find(
            (item) =>
              item.kind === 'folder' &&
              item.title.toLocaleLowerCase('cs') === name.toLocaleLowerCase('cs'),
          );
          const created = existing ?? (await files.createFolder(scope, parent, name, 'organizers'));
          if (!existing) await inheritVisibility(parent, created);
          folderCache.set(key, created.id);
          parent = created.id;
        }
        const record = await files.uploadFile(
          scope,
          parent,
          { name: file.name, data: new Uint8Array(await file.arrayBuffer()) },
          'organizers',
        );
        await inheritVisibility(parent, record);
        done += 1;
      } catch (error) {
        if (error instanceof FileTooLargeError) {
          notifyError(t('drive.tooLarge', { name: error.fileName, size: formatBytes(error.size) }));
        } else {
          notifyError(
            t('drive.uploadFailed', { name: file.name, message: errorMessage(t, error) }),
          );
        }
      }
    }
    notifications.update({
      id,
      loading: false,
      autoClose: 3000,
      withCloseButton: true,
      color: 'teal',
      message: t('drive.uploaded', { count: done }),
    });
  }

  async function currentItems() {
    return (await cache.records.where('team_id').equals(team.id).toArray()).filter(
      (row) => (row.kind === 'file' || row.kind === 'folder') && row.deleted_at === null,
    );
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (!canEdit) return;
    void fromDrop(event.dataTransfer.items).then(upload);
  }

  return (
    <Stack gap="xs" h="100%">
      <Group justify="space-between">
        <Breadcrumbs>
          <Anchor component="button" onClick={() => onOpenFolder(null)}>
            {scopeTitle}
          </Anchor>
          {path.map((folder) => (
            <Anchor key={folder.id} component="button" onClick={() => onOpenFolder(folder.id)}>
              {folder.title}
            </Anchor>
          ))}
        </Breadcrumbs>
        {canEdit && (
          <Group gap="xs">
            <Button
              size="xs"
              variant="default"
              leftSection={<IconFolderPlus size={14} />}
              onClick={createFolder}
            >
              {t('drive.newFolder')}
            </Button>
            <Menu position="bottom-end">
              <Menu.Target>
                <Button
                  size="xs"
                  leftSection={<IconUpload size={14} />}
                  rightSection={<IconChevronDown size={14} />}
                >
                  {t('drive.upload')}
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => fileInput.current?.click()}>
                  {t('drive.upload')}
                </Menu.Item>
                <Menu.Item onClick={() => folderInput.current?.click()}>
                  {t('drive.uploadFolder')}
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconTemplate size={14} />}
                  onClick={() => setTemplateOpen(true)}
                >
                  {t('drive.fromTemplate')}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              data-testid="upload-input"
              onChange={(event) => {
                void upload(fromInput(event.currentTarget.files));
                event.currentTarget.value = '';
              }}
            />
            <input
              ref={folderInput}
              type="file"
              hidden
              data-testid="upload-folder-input"
              // @ts-expect-error -- non-standard but supported by Chromium
              webkitdirectory=""
              onChange={(event) => {
                void upload(fromInput(event.currentTarget.files));
                event.currentTarget.value = '';
              }}
            />
          </Group>
        )}
      </Group>
      <Paper
        withBorder
        flex={1}
        p={0}
        data-testid="drop-zone"
        style={{
          outline: dragging ? '2px dashed var(--mantine-color-teal-6)' : undefined,
          overflow: 'hidden',
        }}
        onDragOver={(event) => {
          if (!canEdit) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <ScrollArea h="100%">
          {rows.length === 0 ? (
            <Stack align="center" justify="center" h={200} gap={4}>
              <Text c="dimmed">{t('drive.empty')}</Text>
              {canEdit && (
                <Text size="sm" c="dimmed">
                  {t('drive.dropHere')}
                </Text>
              )}
            </Stack>
          ) : (
            <ItemTable
              rows={rows}
              selectedId={selectedId}
              onSelect={onSelect}
              onOpen={(id) => {
                const row = rows.find((item) => item.id === id);
                if (row?.kind === 'folder') onOpenFolder(id);
                else onSelect(id);
              }}
            />
          )}
        </ScrollArea>
      </Paper>
      <Text size="xs" c="dimmed">
        {t('drive.honestLimit')}
      </Text>
      {templateOpen && (
        <TemplateDialog
          scope={scope}
          folderId={folderId}
          folderTitle={path.at(-1)?.title ?? ''}
          onClose={() => setTemplateOpen(false)}
        />
      )}
    </Stack>
  );
}

function ItemTable({
  rows,
  selectedId,
  onSelect,
  onOpen,
}: {
  rows: RecordRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const locks = useLocks();
  const { me } = useTeam();
  const now = useNow();

  const onKey = (event: KeyboardEvent, id: string) => {
    if (event.key === 'Enter') onOpen(id);
    if (event.key === ' ') {
      event.preventDefault();
      onSelect(id);
    }
  };

  return (
    <Table highlightOnHover verticalSpacing={6} data-testid="drive-table">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{t('drive.name')}</Table.Th>
          <Table.Th w={90}>{t('drive.size')}</Table.Th>
          <Table.Th w={110}>{t('drive.modified')}</Table.Th>
          <Table.Th w={110} />
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((row) => {
          const info = row.kind === 'file' ? readData(fileKind, row) : null;
          const lock = locks.get(row.id);
          return (
            <Table.Tr
              key={row.id}
              tabIndex={0}
              data-testid="drive-row"
              data-name={row.title}
              style={{
                cursor: 'pointer',
                background:
                  row.id === selectedId ? 'var(--mantine-primary-color-light)' : undefined,
              }}
              onClick={() => onSelect(row.id)}
              onDoubleClick={() => onOpen(row.id)}
              onKeyDown={(event) => onKey(event, row.id)}
            >
              <Table.Td>
                <Group gap="xs" wrap="nowrap">
                  {fileIcon(row)}
                  <Text size="sm" truncate>
                    {row.title}
                  </Text>
                  {info?.is_template && (
                    <Badge size="xs" variant="outline">
                      {t('drive.template')}
                    </Badge>
                  )}
                </Group>
              </Table.Td>
              <Table.Td>
                <Text size="xs" c="dimmed">
                  {info ? formatBytes(info.size) : ''}
                </Text>
              </Table.Td>
              <Table.Td>
                <Tooltip label={formatDateTime(new Date(row.updated_at))}>
                  <Text size="xs" c="dimmed">
                    {formatDate(new Date(row.updated_at))}
                  </Text>
                </Tooltip>
              </Table.Td>
              <Table.Td>
                <Group gap={4} justify="flex-end" wrap="nowrap">
                  {lock && isLockFresh(lock, now) && (
                    <Tooltip
                      label={
                        lock.user_id === me.user_id
                          ? t('drive.lockedByMe')
                          : t('drive.lockedBy', { name: lock.display_name })
                      }
                    >
                      <ActionIcon size="sm" variant="light" color="orange" data-testid="lock-icon">
                        <IconLock size={12} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  <VisibilityBadge visibility={row.visibility} />
                </Group>
              </Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}

/** The current time, refreshed every 30 seconds (lock freshness). */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
