import {
  Alert,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createTeam, joinTeam } from '../data/repo';
import { classifyError } from '../data/remote';
import { useBackend } from './backend';
import { useSession } from './session';
import { useWorkspace } from './workspace';

/** Shown to a signed-in user who belongs to no team yet. */
export function OnboardingScreen({ initialCode }: { initialCode?: string | null }) {
  const { t } = useTranslation();
  const { client } = useBackend();
  const { signOut } = useSession();
  const { engine, setTeamId } = useWorkspace();
  const [code, setCode] = useState(initialCode ?? '');
  const [name, setName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'join' | 'create' | null>(null);

  async function run(kind: 'join' | 'create') {
    setError(null);
    setBusy(kind);
    try {
      const teamId =
        kind === 'join'
          ? await joinTeam(client, code, name)
          : await createTeam(client, teamName, name);
      await engine.sync(teamId, { reconcile: true });
      setTeamId(teamId);
    } catch (thrown) {
      const classified = classifyError(thrown);
      setError(
        /invalid or expired invite/.test(classified.message)
          ? t('onboarding.errors.invite')
          : t('onboarding.errors.generic', { message: classified.message }),
      );
    } finally {
      setBusy(null);
    }
  }

  const nameOk = name.trim().length > 0;

  return (
    <Stack maw={860} mx="auto" mt="xl">
      <Group justify="space-between">
        <Title order={2}>{t('onboarding.title')}</Title>
        <Button variant="subtle" onClick={() => void signOut()}>
          {t('onboarding.signOut')}
        </Button>
      </Group>
      <Text>{t('onboarding.intro')}</Text>
      <TextInput
        label={t('onboarding.displayName')}
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        maxLength={120}
        required
        autoFocus
      />
      {error && (
        <Alert color="red" variant="light" role="alert">
          {error}
        </Alert>
      )}
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Paper withBorder p="lg">
          <Stack>
            <Title order={4}>{t('onboarding.joinTitle')}</Title>
            <TextInput
              label={t('onboarding.code')}
              placeholder={t('onboarding.codePlaceholder')}
              value={code}
              onChange={(event) => setCode(event.currentTarget.value)}
            />
            <Button
              loading={busy === 'join'}
              disabled={!nameOk || code.trim().length < 6}
              onClick={() => void run('join')}
            >
              {t('onboarding.join')}
            </Button>
          </Stack>
        </Paper>
        <Paper withBorder p="lg">
          <Stack>
            <Title order={4}>{t('onboarding.createTitle')}</Title>
            <TextInput
              label={t('onboarding.teamName')}
              placeholder={t('onboarding.teamNamePlaceholder')}
              value={teamName}
              onChange={(event) => setTeamName(event.currentTarget.value)}
              maxLength={120}
            />
            <Button
              variant="light"
              loading={busy === 'create'}
              disabled={!nameOk || teamName.trim().length === 0}
              onClick={() => void run('create')}
            >
              {t('onboarding.createTeam')}
            </Button>
          </Stack>
        </Paper>
      </SimpleGrid>
    </Stack>
  );
}
