import { Alert, Center, Loader, Text } from '@mantine/core';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { previewKindOf } from '@core/files/names';
import type { RecordRow } from '@core/model';
import { errorMessage } from '../../components/errors';
import { useDrive } from '../context';

const DocxPreview = lazy(() => import('./DocxPreview'));
const XlsxPreview = lazy(() => import('./XlsxPreview'));
const PdfPreview = lazy(() => import('./PdfPreview'));
const PptxPreview = lazy(() => import('./PptxPreview'));
const TextPreview = lazy(() => import('./TextPreview'));
const ImagePreview = lazy(() => import('./ImagePreview'));

/** Downloads (or reads from cache) the current version and shows a preview. */
export function FilePreview({ record }: { record: RecordRow }) {
  const { t } = useTranslation();
  const { files } = useDrive();
  const kind = previewKindOf(record.title);
  const [state, setState] = useState<{ data: Uint8Array } | { error: string } | null>(null);
  const sha = typeof record.data['sha256'] === 'string' ? record.data['sha256'] : '';

  useEffect(() => {
    if (kind === 'none') return;
    let cancelled = false;
    files.getBytes(record).then(
      ({ data }) => {
        if (!cancelled) setState({ data });
      },
      (error: unknown) => {
        if (!cancelled) setState({ error: errorMessage(t, error) });
      },
    );
    return () => {
      cancelled = true;
    };
    // Reload when the content changes (a new version).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id, sha, kind]);

  if (kind === 'none') {
    return (
      <Text size="sm" c="dimmed">
        {t('drive.noPreview')}
      </Text>
    );
  }
  if (state === null) {
    return (
      <Center h={160}>
        <Loader size="sm" />
      </Center>
    );
  }
  if ('error' in state) {
    return (
      <Alert color="red" variant="light">
        {state.error}
      </Alert>
    );
  }
  return (
    <Suspense
      fallback={
        <Center h={160}>
          <Loader size="sm" />
        </Center>
      }
    >
      <div data-testid="file-preview" data-kind={kind}>
        {kind === 'docx' && <DocxPreview data={state.data} />}
        {kind === 'xlsx' && <XlsxPreview data={state.data} />}
        {kind === 'pdf' && <PdfPreview data={state.data} />}
        {kind === 'pptx' && <PptxPreview data={state.data} />}
        {kind === 'image' && <ImagePreview data={state.data} name={record.title} />}
        {(kind === 'text' || kind === 'markdown') && (
          <TextPreview data={state.data} markdown={kind === 'markdown'} />
        )}
      </div>
    </Suspense>
  );
}

export function PreviewError() {
  const { t } = useTranslation();
  return (
    <Alert color="orange" variant="light">
      {t('drive.previewFailed')}
    </Alert>
  );
}
