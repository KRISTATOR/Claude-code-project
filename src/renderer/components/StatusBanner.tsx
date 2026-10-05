import { Alert } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '@core/format';
import { useSyncStatus, useWorkspace } from '../app/workspace';

/** Explains why editing is unavailable: offline, paused server, or a sync error. */
export function StatusBanner() {
  const { t } = useTranslation();
  const status = useSyncStatus();
  const { offline } = useWorkspace();
  const when = status.lastSyncAt ? formatDateTime(new Date(status.lastSyncAt)) : t('sync.never');

  if (offline || status.state === 'offline') {
    return (
      <Alert color="gray" variant="light" mb="md" data-testid="offline-banner">
        {t('sync.offlineBanner', { when })}
      </Alert>
    );
  }
  if (status.state === 'paused') {
    return (
      <Alert color="orange" variant="light" mb="md">
        {t('sync.pausedBanner', { when })}
      </Alert>
    );
  }
  if (status.state === 'error' && status.message) {
    return (
      <Alert color="red" variant="light" mb="md">
        {t('sync.errorBanner', { message: status.message })}
      </Alert>
    );
  }
  return null;
}
