import { Button, Stack } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { openPdf, type OpenedPdf } from '../pdf';
import { PreviewError } from './FilePreview';

const PAGE_STEP = 5;

/** PDF pages rendered with pdf.js, a few at a time. */
export default function PdfPreview({ data }: { data: Uint8Array }) {
  const { t } = useTranslation();
  const holder = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<OpenedPdf | null>(null);
  const [shown, setShown] = useState(PAGE_STEP);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const state: { opened: OpenedPdf | null; cancelled: boolean } = {
      opened: null,
      cancelled: false,
    };
    openPdf(data).then(
      (result) => {
        state.opened = result;
        if (state.cancelled) void result.close();
        else setDoc(result);
      },
      () => setFailed(true),
    );
    return () => {
      state.cancelled = true;
      void state.opened?.close();
    };
  }, [data]);

  useEffect(() => {
    const element = holder.current;
    if (!doc || !element) return;
    const life = { cancelled: false };
    const cancelled = () => life.cancelled;
    void (async () => {
      element.innerHTML = '';
      const count = Math.min(doc.pdf.numPages, shown);
      for (let number = 1; number <= count && !cancelled(); number += 1) {
        const page = await doc.pdf.getPage(number);
        const viewport = page.getViewport({ scale: 1 });
        const scale = Math.min(1.5, (element.clientWidth || 360) / viewport.width);
        const scaled = page.getViewport({ scale: scale * window.devicePixelRatio });
        const canvas = document.createElement('canvas');
        canvas.width = scaled.width;
        canvas.height = scaled.height;
        canvas.style.width = '100%';
        canvas.style.marginBottom = '8px';
        canvas.style.boxShadow = '0 1px 3px rgba(0,0,0,.25)';
        element.appendChild(canvas);
        await page.render({ canvas, viewport: scaled }).promise;
      }
    })().catch(() => setFailed(true));
    return () => {
      life.cancelled = true;
    };
  }, [doc, shown]);

  if (failed) return <PreviewError />;
  return (
    <Stack gap="xs">
      <div ref={holder} style={{ maxHeight: '70vh', overflow: 'auto' }} />
      {doc && doc.pdf.numPages > shown && (
        <Button size="xs" variant="subtle" onClick={() => setShown((value) => value + PAGE_STEP)}>
          {t('drive.morePages')}
        </Button>
      )}
    </Stack>
  );
}
