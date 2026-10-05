import { Button, Stack, Table, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '@core/format';
import { errorMessage } from '../../components/errors';
import { notifyError } from '../../components/notify';
import { useTrash } from '../../data/hooks';
import { useTeam } from '../workspace';

export function TrashPage() {
  const { t } = useTranslation();
  const { repo, canEdit } = useTeam();
  const trash = useTrash() ?? [];
  return (
    <Stack>
      <Title order={2}>{t('trash.title')}</Title>
      {trash.length === 0 ? (
        <Text c="dimmed">{t('trash.empty')}</Text>
      ) : (
        <Table striped>
          <Table.Tbody>
            {trash.map((record) => (
              <Table.Tr key={record.id}>
                <Table.Td>{record.title}</Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {t('trash.deletedAt', {
                      when: formatDateTime(new Date(record.deleted_at ?? record.updated_at)),
                    })}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Button
                    size="xs"
                    variant="light"
                    disabled={!canEdit}
                    onClick={() => {
                      repo
                        .restoreRecord(record)
                        .catch((error: unknown) => notifyError(errorMessage(t, error)));
                    }}
                  >
                    {t('trash.restore')}
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
