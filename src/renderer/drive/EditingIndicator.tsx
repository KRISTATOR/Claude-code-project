import {
  Badge,
  Button,
  Group,
  Indicator,
  Popover,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { IconEdit } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '@core/format';
import { notifySuccess } from '../components/notify';
import { useDrive, useEditSessions } from './context';

/** "Rozpracované soubory": files checked out on this computer, with "Hotovo". */
export function EditingIndicator() {
  const { t } = useTranslation();
  const sessions = useEditSessions();
  const { office } = useDrive();
  if (sessions.length === 0) return null;

  return (
    <Popover
      position="bottom-end"
      width={380}
      shadow="md"
      defaultOpened={sessions.some((s) => s.needsManualDone)}
    >
      <Popover.Target>
        <Indicator label={sessions.length} size={16} color="orange">
          <UnstyledButton aria-label={t('editing.title')} data-testid="editing-indicator">
            <Group gap={4}>
              <IconEdit size={18} />
              <Text size="sm">{t('editing.title')}</Text>
            </Group>
          </UnstyledButton>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm" data-testid="editing-panel">
          {sessions.map((session) => (
            <Stack key={session.fileId} gap={4}>
              <Group justify="space-between" wrap="nowrap">
                <Text size="sm" fw={500} truncate>
                  {session.name}
                </Text>
                <Badge
                  size="xs"
                  color={session.state === 'lost' ? 'orange' : 'blue'}
                  variant="light"
                >
                  {t(`editing.${session.state === 'opening' ? 'open' : session.state}`)}
                </Badge>
              </Group>
              {session.lastSavedAt !== null && (
                <Text size="xs" c="dimmed">
                  {t('editing.savedAt', { when: formatDateTime(new Date(session.lastSavedAt)) })}
                </Text>
              )}
              {session.needsManualDone && (
                <Text size="xs" c="dimmed">
                  {t('editing.manualDone')}
                </Text>
              )}
              <Group gap="xs">
                <Button
                  size="compact-xs"
                  onClick={() => void office.done(session.fileId)}
                  loading={session.state === 'closing'}
                  data-testid="editing-done"
                >
                  {t('editing.done')}
                </Button>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  onClick={() =>
                    void office
                      .keepVersion(session.fileId)
                      .then(() => notifySuccess(t('editing.keepDone')))
                  }
                >
                  {t('editing.keep')}
                </Button>
              </Group>
            </Stack>
          ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
