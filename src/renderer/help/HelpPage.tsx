import { Box, Grid, NavLink, Paper, Stack, Text, Typography } from '@mantine/core';
import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';
import { useTranslation } from 'react-i18next';
import { fold } from '@core/text';
import guide from './navod.md?raw';

/** "návod k Zázemí" → "navod-k-zazemi" */
function slug(text: string): string {
  return fold(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const markdown = new MarkdownIt({ html: false, linkify: false, typographer: true });
const headings: { id: string; text: string }[] = [];
const tokens = markdown.parse(guide, {});
tokens.forEach((token, index) => {
  if (token.type === 'heading_open' && token.tag === 'h2') {
    const text = tokens[index + 1]?.content ?? '';
    const id = slug(text);
    token.attrSet('id', id);
    headings.push({ id, text });
  }
});
const html = DOMPurify.sanitize(markdown.renderer.render(tokens, markdown.options, {}), {
  USE_PROFILES: { html: true },
});

/** The Czech user guide (src/renderer/help/navod.md), with a table of contents. */
export function HelpPage() {
  const { t } = useTranslation();
  return (
    <Grid>
      <Grid.Col span={{ base: 12, md: 3 }}>
        <Paper withBorder p="xs" pos="sticky" top={60}>
          <Text size="xs" c="dimmed" fw={600} px="xs" mb={4}>
            {t('help.contents')}
          </Text>
          <Stack gap={0}>
            {headings.map((heading) => (
              <NavLink
                key={heading.id}
                label={heading.text}
                py={4}
                onClick={() =>
                  document.getElementById(heading.id)?.scrollIntoView({ behavior: 'smooth' })
                }
              />
            ))}
          </Stack>
        </Paper>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 9 }}>
        <Box maw={760} data-testid="help-guide">
          <Typography>
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </Typography>
        </Box>
      </Grid.Col>
    </Grid>
  );
}
