import { Image } from '@mantine/core';
import { useEffect, useMemo } from 'react';
import { mimeOf } from '@core/files/names';

export default function ImagePreview({ data, name }: { data: Uint8Array; name: string }) {
  const url = useMemo(
    () => URL.createObjectURL(new Blob([data as BlobPart], { type: mimeOf(name) })),
    [data, name],
  );
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <Image src={url} alt={name} fit="contain" mah="70vh" radius="sm" />;
}
