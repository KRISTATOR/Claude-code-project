import { renderAsync } from 'docx-preview';
import { useEffect, useRef, useState } from 'react';
import { PreviewError } from './FilePreview';

/** Word document rendered to HTML (docx-preview); no scripts are executed. */
export default function DocxPreview({ data }: { data: Uint8Array }) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    element.innerHTML = '';
    renderAsync(new Blob([data as BlobPart]), element, undefined, {
      inWrapper: true,
      breakPages: true,
      ignoreLastRenderedPageBreak: true,
      experimental: false,
      useBase64URL: true,
    }).catch(() => setFailed(true));
  }, [data]);

  if (failed) return <PreviewError />;
  return (
    <div
      ref={container}
      style={{
        maxHeight: '70vh',
        overflow: 'auto',
        background: '#f1f3f5',
        borderRadius: 4,
        zoom: 0.6,
      }}
    />
  );
}
