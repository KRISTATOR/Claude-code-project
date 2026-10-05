import { Alert, Button, Group, List, Modal, ScrollArea, Stack, Table, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import {
  planSummary,
  reportText,
  type ImportPlan,
  type ImportReport,
  type SkipReason,
} from '@core/files/takeout';
import { errorMessage } from '../components/errors';
import { notifyError } from '../components/notify';
import { fileName } from '../print/service';

/** What an archive import will do, before anything is uploaded. */
export function ImportPreview({
  plan,
  onStart,
  onCancel,
}: {
  plan: ImportPlan;
  onStart: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal opened onClose={onCancel} title={t('drive.importTitle')} size="lg">
      <Stack>
        <Text size="sm" c="dimmed">
          {t('drive.importHint')}
        </Text>
        <Text fw={700} data-testid="import-count">
          {t('drive.importFiles', { count: plan.files.length })}
        </Text>
        <ScrollArea.Autosize mah={240}>
          <Table fz="sm">
            <Table.Tbody>
              {planSummary(plan).map((row) => (
                <Table.Tr key={row.folder}>
                  <Table.Td>{row.folder || t('drive.importRoot')}</Table.Td>
                  <Table.Td ta="right">{row.files}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
        {plan.skipped.length > 0 && (
          <Text size="sm" c="dimmed">
            {t('drive.importSkipped', { count: plan.skipped.length })}
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button disabled={plan.files.length === 0} onClick={onStart}>
            {t('drive.importStart')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** Imported, skipped (with the reason) and failed files, savable as text. */
export function ImportReportDialog({
  report,
  onClose,
}: {
  report: ImportReport;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const reason = (code: SkipReason) => t(`drive.reasons.${code}`);
  async function saveReport() {
    const text = reportText(report, {
      title: t('drive.reportTitle'),
      imported: t('drive.reportImported'),
      skipped: t('drive.reportSkipped'),
      failed: t('drive.reportFailed'),
      reasons: {
        junk: reason('junk'),
        google_form: reason('google_form'),
        google_link: reason('google_link'),
        takeout_index: reason('takeout_index'),
        too_large: reason('too_large'),
        duplicate: reason('duplicate'),
        existing: reason('existing'),
      },
    });
    try {
      await window.zazemi.dialogs.saveFile({
        defaultName: fileName(t('drive.reportFile'), 'txt'),
        filters: [{ name: t('drive.textFiles'), extensions: ['txt'] }],
        data: new TextEncoder().encode(text),
      });
    } catch (error) {
      notifyError(errorMessage(t, error));
    }
  }
  return (
    <Modal opened onClose={onClose} title={t('drive.reportTitle')} size="lg">
      <Stack data-testid="import-report">
        <Text fw={700}>
          {t('drive.reportImported')}: {report.imported.length}
        </Text>
        {report.skipped.length > 0 && (
          <Stack gap={4}>
            <Text fw={700}>
              {t('drive.reportSkipped')}: {report.skipped.length}
            </Text>
            <ScrollArea.Autosize mah={200}>
              <List size="sm" spacing={2}>
                {report.skipped.map((item) => (
                  <List.Item key={`${item.path}:${item.reason}`}>
                    {item.path} – {reason(item.reason)}
                  </List.Item>
                ))}
              </List>
            </ScrollArea.Autosize>
          </Stack>
        )}
        {report.failed.length > 0 && (
          <Alert
            color="red"
            variant="light"
            title={`${t('drive.reportFailed')}: ${String(report.failed.length)}`}
          >
            <List size="sm" spacing={2}>
              {report.failed.map((item) => (
                <List.Item key={item.path}>
                  {item.path} – {item.message}
                </List.Item>
              ))}
            </List>
          </Alert>
        )}
        <Group justify="space-between">
          <Button variant="light" onClick={() => void saveReport()}>
            {t('drive.reportSave')}
          </Button>
          <Button onClick={onClose}>{t('common.close')}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
