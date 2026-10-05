import {
  Alert,
  Button,
  Paper,
  PasswordInput,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBackend } from './backend';

type Mode = 'signin' | 'signup';

export function AuthScreen() {
  const { t } = useTranslation();
  const { client } = useBackend();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: { preventDefault(): void }) {
    event.preventDefault();
    setError(null);
    if (mode === 'signup' && password.length < 8) {
      setError(t('auth.errors.weak'));
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error: signInError } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) setError(describe(signInError.message, signInError.status));
      } else {
        const { data, error: signUpError } = await client.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpError) setError(describe(signUpError.message, signUpError.status));
        else if (!data.session) setError(t('auth.errors.confirmation'));
      }
    } catch (thrown) {
      setError(describe(String(thrown), 0));
    } finally {
      setBusy(false);
    }
  }

  function describe(message: string, status: number | undefined): string {
    if (status === 0 || /fetch/i.test(message)) return t('auth.errors.offline');
    if (/invalid login credentials/i.test(message)) return t('auth.errors.invalid');
    if (/already registered|already exists/i.test(message)) return t('auth.errors.exists');
    if (/password/i.test(message) && /least|short|weak/i.test(message))
      return t('auth.errors.weak');
    return t('auth.errors.generic', { message });
  }

  return (
    <Paper
      withBorder
      p="xl"
      maw={460}
      mx="auto"
      mt="xl"
      component="form"
      onSubmit={(e) => void submit(e)}
    >
      <Stack>
        <Title order={2}>{t('auth.title')}</Title>
        <Tabs value={mode} onChange={(value) => setMode(value === 'signup' ? 'signup' : 'signin')}>
          <Tabs.List grow>
            <Tabs.Tab value="signin">{t('auth.signInTab')}</Tabs.Tab>
            <Tabs.Tab value="signup">{t('auth.signUpTab')}</Tabs.Tab>
          </Tabs.List>
        </Tabs>
        <TextInput
          label={t('auth.email')}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
          autoFocus
        />
        <PasswordInput
          label={t('auth.password')}
          description={mode === 'signup' ? t('auth.passwordHelp') : undefined}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          required
          value={password}
          onChange={(event) => setPassword(event.currentTarget.value)}
        />
        {error && (
          <Alert color="red" variant="light" role="alert">
            {error}
          </Alert>
        )}
        <Button type="submit" loading={busy}>
          {mode === 'signin' ? t('auth.signIn') : t('auth.signUp')}
        </Button>
        <Text size="sm" c="dimmed">
          {t('auth.forgot')}
        </Text>
      </Stack>
    </Paper>
  );
}
