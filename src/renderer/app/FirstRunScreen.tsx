import {
  Alert,
  Anchor,
  Button,
  Collapse,
  Paper,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  connectionConfigSchema,
  decodeConnectionCode,
  type ConnectionConfig,
} from '@core/connection';
import type { cs } from '../i18n/cs';

type ErrorKey = keyof typeof cs.firstRun.errors;

function toErrorKey(message: string | undefined): ErrorKey {
  const known: ErrorKey[] = [
    'url-not-https',
    'key-too-short',
    'key-is-secret',
    'config-from-build',
  ];
  return known.find((key) => key === message) ?? 'generic';
}

/** Shown when the app does not know which Supabase project to use. */
export function FirstRunScreen({ onConnected }: { onConnected: () => void }) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [manual, setManual] = useState(false);
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState<ErrorKey | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: { preventDefault(): void }) {
    event.preventDefault();
    setError(null);

    let config: ConnectionConfig;
    if (manual) {
      const parsed = connectionConfigSchema.safeParse({ supabaseUrl: url, supabaseAnonKey: key });
      if (!parsed.success) {
        setError(toErrorKey(parsed.error.issues[0]?.message));
        return;
      }
      config = parsed.data;
    } else {
      const decoded = decodeConnectionCode(code);
      if (!decoded.ok) {
        setError(decoded.reason);
        return;
      }
      config = decoded.config;
    }

    setBusy(true);
    const result = await window.zazemi.config.set(config);
    setBusy(false);
    if (result.ok) onConnected();
    else setError(toErrorKey(result.error));
  }

  return (
    <Paper
      withBorder
      p="xl"
      maw={560}
      mx="auto"
      mt="xl"
      component="form"
      onSubmit={(event) => void submit(event)}
    >
      <Stack>
        <Title order={2}>{t('firstRun.title')}</Title>
        <Text>{t('firstRun.intro')}</Text>

        {!manual && (
          <Textarea
            label={t('firstRun.codeLabel')}
            description={t('firstRun.codeHelp')}
            placeholder={t('firstRun.codePlaceholder')}
            value={code}
            onChange={(event) => setCode(event.currentTarget.value)}
            autosize
            minRows={2}
            data-autofocus
            autoFocus
          />
        )}

        <Anchor
          component="button"
          type="button"
          size="sm"
          onClick={() => {
            setManual((value) => !value);
            setError(null);
          }}
        >
          {manual ? t('firstRun.useCode') : t('firstRun.advanced')}
        </Anchor>
        <Collapse expanded={manual}>
          <Stack>
            <TextInput
              label={t('firstRun.urlLabel')}
              placeholder={t('firstRun.urlPlaceholder')}
              value={url}
              onChange={(event) => setUrl(event.currentTarget.value)}
            />
            <TextInput
              label={t('firstRun.keyLabel')}
              value={key}
              onChange={(event) => setKey(event.currentTarget.value)}
            />
          </Stack>
        </Collapse>

        {error && (
          <Alert color="red" variant="light" role="alert">
            {t(`firstRun.errors.${error}`)}
          </Alert>
        )}

        <Button type="submit" loading={busy}>
          {t('firstRun.connect')}
        </Button>
        <Text size="sm" c="dimmed">
          {t('firstRun.setupHint')}
        </Text>
      </Stack>
    </Paper>
  );
}
