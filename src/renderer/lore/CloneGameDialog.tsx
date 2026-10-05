import { Alert, Button, Checkbox, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { IconCopy } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { cloneGame } from '@core/lore/clone';
import type { RecordRow } from '@core/model';
import { useTeam, useWorkspace } from '../app/workspace';
import { useCurrentGame } from '../data/hooks';
import { useRun } from '../tools/common';

/** "Klonovat jako pokračování": a copy of the game with new ids (docs/PLAN.md M3). */
export function CloneGameButton({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="light" leftSection={<IconCopy size={14} />} onClick={() => setOpen(true)}>
        {t('clone.button')}
      </Button>
      {open && <CloneGameDialog game={game} onClose={() => setOpen(false)} />}
    </>
  );
}

function CloneGameDialog({ game, onClose }: { game: RecordRow; onClose: () => void }) {
  const { t } = useTranslation();
  const { cache } = useWorkspace();
  const { team, repo } = useTeam();
  const { setGameId } = useCurrentGame();
  const navigate = useNavigate();
  const run = useRun();
  const [title, setTitle] = useState(`${game.title} II`);
  const [keepPeople, setKeepPeople] = useState(false);
  const [busy, setBusy] = useState(false);

  async function clone() {
    setBusy(true);
    const ok = await run(async () => {
      const [records, secrets, access, people] = await Promise.all([
        cache.records.where('team_id').equals(team.id).toArray(),
        cache.secrets.where('team_id').equals(team.id).toArray(),
        cache.access.where('team_id').equals(team.id).toArray(),
        cache.recordPeople.where('team_id').equals(team.id).toArray(),
      ]);
      const result = cloneGame(
        game,
        records,
        { secrets, access, people },
        { title: title.trim(), keepPeople },
        () => crypto.randomUUID(),
      );
      await repo.insertClone(result);
      const newId = result.ids.get(game.id);
      if (newId) {
        setGameId(newId);
        void navigate(`/svety/${newId}`);
      }
    }, t('clone.done'));
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Modal opened onClose={onClose} title={t('clone.title')}>
      <Stack>
        <Text size="sm">{t('clone.intro')}</Text>
        <TextInput
          label={t('clone.newTitle')}
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          data-autofocus
        />
        <Checkbox
          label={t('clone.keepPeople')}
          checked={keepPeople}
          onChange={(event) => setKeepPeople(event.currentTarget.checked)}
        />
        <Alert variant="light" color="gray" p="xs">
          <Text size="xs">{t('clone.filesNote')}</Text>
        </Alert>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={busy} disabled={!title.trim()} onClick={() => void clone()}>
            {t('clone.confirm')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
