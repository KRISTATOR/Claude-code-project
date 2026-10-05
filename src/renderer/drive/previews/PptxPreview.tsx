import { Image, Stack, Text } from '@mantine/core';
import { unzipSync } from 'fflate';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { extractText } from '@core/files/extract';

/**
 * PowerPoint is not rendered in full; show the preview picture PowerPoint
 * embeds (if any) and the slide text, and point to PowerPoint.
 */
export default function PptxPreview({ data }: { data: Uint8Array }) {
  const { t } = useTranslation();
  const { thumbnail, text } = useMemo(() => {
    let url: string | null = null;
    try {
      const files = unzipSync(data, {
        filter: (file) => file.name.startsWith('docProps/thumbnail'),
      });
      const entry = Object.entries(files)[0];
      if (entry) {
        const type = entry[0].endsWith('.png') ? 'image/png' : 'image/jpeg';
        url = URL.createObjectURL(new Blob([entry[1]], { type }));
      }
    } catch {
      url = null;
    }
    return { thumbnail: url, text: extractText('x.pptx', data) ?? '' };
  }, [data]);

  return (
    <Stack gap="xs">
      {thumbnail && <Image src={thumbnail} alt="" radius="sm" />}
      <Text size="sm" c="dimmed">
        {t('drive.pptxHint')}
      </Text>
      <Text size="sm" style={{ whiteSpace: 'pre-wrap' }} lineClamp={20}>
        {text}
      </Text>
    </Stack>
  );
}
