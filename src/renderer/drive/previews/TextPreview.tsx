import { Typography } from '@mantine/core';
import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';
import { useMemo } from 'react';

const markdown = new MarkdownIt({ html: false, linkify: false, typographer: true });

/** Plain text, or Markdown rendered without raw HTML and then sanitized. */
export default function TextPreview({
  data,
  markdown: isMarkdown,
}: {
  data: Uint8Array;
  markdown: boolean;
}) {
  const text = useMemo(() => new TextDecoder('utf-8').decode(data), [data]);
  const html = useMemo(
    () =>
      isMarkdown ? DOMPurify.sanitize(markdown.render(text), { USE_PROFILES: { html: true } }) : '',
    [isMarkdown, text],
  );
  if (!isMarkdown) {
    return (
      <pre style={{ whiteSpace: 'pre-wrap', maxHeight: '70vh', overflow: 'auto', margin: 0 }}>
        {text}
      </pre>
    );
  }
  return (
    <Typography>
      <div
        style={{ maxHeight: '70vh', overflow: 'auto' }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </Typography>
  );
}
