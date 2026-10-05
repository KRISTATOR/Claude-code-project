import { Alert, Button, Group, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UpdateStatus } from '@shared/api';

/** Shown only while a new version downloads or waits for a restart. */
export function UpdateBanner() {
  const { t } = useTranslation();
  const status = useUpdateStatus();

  if (status.state === 'downloading') {
    return (
      <Alert variant="light" color="blue" py="xs">
        {t('updates.downloading', { version: status.version, percent: status.percent })}
      </Alert>
    );
  }
  if (status.state === 'ready') {
    return (
      <Alert variant="light" color="teal" py="xs" data-testid="update-ready">
        <Group justify="space-between">
          <Text size="sm">{t('updates.ready', { version: status.version })}</Text>
          <Button size="xs" onClick={() => void window.zazemi.updates.installNow()}>
            {t('updates.restart')}
          </Button>
        </Group>
      </Alert>
    );
  }
  return null;
}

export function useUpdateStatus(): UpdateStatus {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' });
  useEffect(() => {
    void window.zazemi.updates.getStatus().then(setStatus);
    return window.zazemi.updates.onStatus(setStatus);
  }, []);
  return status;
}
