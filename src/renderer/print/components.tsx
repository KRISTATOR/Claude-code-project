import { Box, Button, Group, Loader, Menu, Modal } from '@mantine/core';
import { IconDownload, IconEye, IconFileTypeDocx, IconFileTypePdf } from '@tabler/icons-react';
import { useElementSize } from '@mantine/hooks';
import DOMPurify from 'dompurify';
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DocxPiece } from '@core/print/docx';
import { fontById } from '@core/print/fonts';
import type { PrintPiece } from '@core/print/html';
import { useRun } from '../tools/common';
import { save, toDocx, toPdf } from './service';

const PdfPreview = lazy(() => import('../drive/previews/PdfPreview'));

const PAPER_BG: Record<string, string> = {
  plain: '#ffffff',
  aged: '#f3ead6',
  parchment: 'radial-gradient(ellipse at center,#f5ead0 55%,#d8c08a 100%)',
  official: '#fdfdf8',
};

/**
 * A printed piece drawn on screen at roughly its paper proportions. It fills
 * its column up to `width` pixels and scales the text with it.
 */
export function PaperPreview({
  piece,
  width: maxWidth = 420,
}: {
  piece: PrintPiece;
  width?: number;
}) {
  const { ref, width: measured } = useElementSize();
  const width = Math.min(maxWidth, measured || maxWidth);
  const ratio = piece.size === 'A4-landscape' || piece.size === 'A6-landscape' ? 0.707 : 1.414;
  const pad = 0.095;
  return (
    <Box ref={ref} maw={maxWidth} w="100%">
      <Box
        className="paper-preview"
        w={width}
        mih={width * ratio}
        style={{
          background: PAPER_BG[piece.look.paper] ?? '#ffffff',
          color: piece.look.ink,
          fontFamily: `"${fontById(piece.look.fontId).family}", serif`,
          // Scale points to the preview: an A4 page is 210 mm wide.
          fontSize: `${(piece.look.sizePt * width) / 595}px`,
        }}
        data-testid="paper-preview"
      >
        {piece.strip && (
          <div className="strip" style={{ padding: `0 ${String(width * pad)}px` }}>
            {piece.strip}
          </div>
        )}
        <div
          style={{ padding: width * pad }}
          // The HTML comes from our own escaping builders; sanitized again for safety.
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(piece.html) }}
        />
      </Box>
    </Box>
  );
}

/** Builds a PDF and shows it with pdf.js. */
export function PdfPreviewButton({
  pieces,
}: {
  pieces: () => PrintPiece[] | Promise<PrintPiece[]>;
}) {
  const { t } = useTranslation();
  const run = useRun();
  const [data, setData] = useState<Uint8Array | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button
        variant="default"
        leftSection={<IconEye size={14} />}
        loading={busy}
        onClick={() => {
          setBusy(true);
          void run(async () => setData(await toPdf(await pieces()))).finally(() => setBusy(false));
        }}
      >
        {t('print.preview')}
      </Button>
      {data && (
        <Modal opened onClose={() => setData(null)} size="xl" title={t('print.preview')}>
          <Suspense fallback={<Loader />}>
            <PdfPreview data={data} />
          </Suspense>
        </Modal>
      )}
    </>
  );
}

/** "Export" menu: PDF (and Word when available). */
export function ExportMenu({
  title,
  pdf,
  docx,
  disabled,
}: {
  title: string;
  pdf: () => PrintPiece[] | Promise<PrintPiece[]> | Promise<Uint8Array>;
  docx?: () => DocxPiece[];
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const run = useRun();
  const [busy, setBusy] = useState(false);
  const go = (action: () => Promise<boolean>) => {
    setBusy(true);
    void run(async () => {
      if (await action()) return;
    }).finally(() => setBusy(false));
  };
  return (
    <Group gap={0}>
      <Menu position="bottom-end">
        <Menu.Target>
          <Button
            leftSection={<IconDownload size={14} />}
            loading={busy}
            disabled={disabled ?? false}
          >
            {t('print.export')}
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<IconFileTypePdf size={16} />}
            onClick={() =>
              go(async () => {
                const result = await pdf();
                const bytes = result instanceof Uint8Array ? result : await toPdf(result);
                return save(bytes, title, 'pdf');
              })
            }
          >
            {t('print.pdf')}
          </Menu.Item>
          {docx && (
            <Menu.Item
              leftSection={<IconFileTypeDocx size={16} />}
              onClick={() => go(async () => save(await toDocx(docx()), title, 'docx'))}
            >
              {t('print.docx')}
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}
