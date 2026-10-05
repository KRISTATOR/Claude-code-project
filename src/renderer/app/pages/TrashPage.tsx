import { Button, Group, Stack, Table, Text, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '@core/format';
import type { RecordRow } from '@core/model';
import { errorMessage } from '../../components/errors';
import { notifyError } from '../../components/notify';
import { useTrash } from '../../data/hooks';
import { useDrive } from '../../drive/context';
import { fileIcon } from '../../drive/DrivePage';
import { useTeam, useWorkspace } from '../workspace';

export function TrashPage() {
  const { t } = useTranslation();
  const { repo, canEdit } = useTeam();
  const { files } = useDrive();
  const { cache } = useWorkspace();
  const trash = useTrash() ?? [];
  // Items trashed together with a folder are shown under that folder only.
  const trashedIds = new Set(trash.map((record) => record.id));
  const top = trash.filter(
    (record) =>
      !record.parent_id ||
      !trashedIds.has(record.parent_id) ||
      trash.find((parent) => parent.id === record.parent_id)?.deleted_at !== record.deleted_at,
  );

  async function restore(record: RecordRow) {
    try {
      const together = trash.filter(
        (item) => item.deleted_at === record.deleted_at && item.id !== record.id,
      );
      const parent = record.parent_id ? await cache.records.get(record.parent_id) : undefined;
      // If its folder is still in the trash, bring it back at the top level.
      const patch = parent?.deleted_at
        ? { deleted_at: null, parent_id: null }
        : { deleted_at: null };
      await repo.updateRecord(record.id, record.rev, patch);
      for (const item of together) await repo.updateRecord(item.id, item.rev, { deleted_at: null });
    } catch (error) {
      notifyError(errorMessage(t, error));
    }
  }

  function deleteForever(record: RecordRow) {
    modals.openConfirmModal({
      title: t('trash.deleteForever'),
      children: <Text size="sm">{t('trash.deleteForeverConfirm', { title: record.title })}</Text>,
      labels: { confirm: t('trash.deleteForever'), cancel: t('common.cancel') },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        void (async () => {
          try {
            const together = trash.filter(
              (item) => item.deleted_at === record.deleted_at && item.id !== record.id,
            );
            for (const item of together.filter((item) => item.kind === 'file'))
              await files.deleteForever(item);
            for (const item of together.filter((item) => item.kind !== 'file'))
              await files.deleteForever(item);
            await files.deleteForever(record);
          } catch (error) {
            notifyError(errorMessage(t, error));
          }
        })();
      },
    });
  }

  return (
    <Stack>
      <Title order={2}>{t('trash.title')}</Title>
      {top.length === 0 ? (
        <Text c="dimmed">{t('trash.empty')}</Text>
      ) : (
        <Table striped>
          <Table.Tbody>
            {top.map((record) => (
              <Table.Tr key={record.id} data-testid="trash-row">
                <Table.Td>
                  <Group gap="xs" wrap="nowrap">
                    {fileIcon(record)}
                    <Text size="sm">{record.title}</Text>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {t('trash.deletedAt', {
                      when: formatDateTime(new Date(record.deleted_at ?? record.updated_at)),
                    })}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs" justify="flex-end">
                    <Button
                      size="xs"
                      variant="light"
                      disabled={!canEdit}
                      onClick={() => void restore(record)}
                    >
                      {t('trash.restore')}
                    </Button>
                    <Button
                      size="xs"
                      variant="subtle"
                      color="red"
                      disabled={!canEdit}
                      onClick={() => deleteForever(record)}
                    >
                      {t('trash.deleteForever')}
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
