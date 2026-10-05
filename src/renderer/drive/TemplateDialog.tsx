import { Button, Group, Modal, Select, Stack, Text, TextInput } from '@mantine/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@core/format';
import type { Scope } from '@core/files/tree';
import { fileKind, readData } from '@core/kinds';
import { characterFields } from '@core/print/merge';
import { compareCzech } from '@core/text';
import { useTeam, useWorkspace } from '../app/workspace';
import { errorMessage } from '../components/errors';
import { notifyError, notifySuccess } from '../components/notify';
import { useDrive } from './context';
import { fillTemplate } from './templates';

/** "Nový ze šablony": copy a template file, filling in team, world, game, date. */
export function TemplateDialog({
  scope,
  folderId,
  folderTitle,
  onClose,
}: {
  scope: Scope;
  folderId: string | null;
  folderTitle: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { cache } = useWorkspace();
  const { team } = useTeam();
  const { files } = useDrive();
  const templates = useLiveQuery(
    async () =>
      (await cache.records.where('[team_id+kind]').equals([team.id, 'file']).toArray())
        .filter((row) => row.deleted_at === null && readData(fileKind, row).is_template)
        .sort((a, b) => compareCzech(a.title, b.title)),
    [cache, team.id],
  );
  const characters = useLiveQuery(
    async () =>
      scope.type === 'game'
        ? (await cache.records.where('[team_id+kind]').equals([team.id, 'character']).toArray())
            .filter((row) => row.deleted_at === null && row.game_id === scope.id)
            .sort((a, b) => compareCzech(a.title, b.title))
        : [],
    [cache, team.id, scope],
  );
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function create() {
    const template = templates?.find((row) => row.id === templateId);
    if (!template) return;
    setBusy(true);
    try {
      const game = scope.type === 'game' ? await cache.records.get(scope.id) : undefined;
      const worldId = scope.type === 'world' ? scope.id : game?.world_id;
      const world = worldId ? await cache.records.get(worldId) : undefined;
      const { data } = await files.getBytes(template);
      const character = characters?.find((row) => row.id === characterId);
      const characterValues = character
        ? characterFields(
            character,
            new Map(
              (await cache.records.where('team_id').equals(team.id).toArray()).map((row) => [
                row.id,
                row,
              ]),
            ),
            await cache.people.where('team_id').equals(team.id).toArray(),
            await cache.recordPeople.where('team_id').equals(team.id).toArray(),
          )
        : {};
      const filled = await fillTemplate(template.title, data, {
        ...characterValues,
        tym: team.name,
        svet: world?.title ?? '',
        hra: game?.title ?? '',
        datum: formatDate(new Date()),
        slozka: folderTitle,
      });
      await files.uploadFile(
        scope,
        folderId,
        { name: name.trim() || template.title, data: filled },
        'organizers',
      );
      notifySuccess(t('common.saved'));
      onClose();
    } catch (error) {
      notifyError(errorMessage(t, error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal opened onClose={onClose} title={t('drive.fromTemplate')}>
      <Stack>
        {templates && templates.length === 0 ? (
          <Text size="sm" c="dimmed">
            {t('drive.noTemplates')}
          </Text>
        ) : (
          <>
            <Select
              label={t('drive.template')}
              data={(templates ?? []).map((row) => ({ value: row.id, label: row.title }))}
              value={templateId}
              onChange={(value) => {
                setTemplateId(value);
                const template = templates?.find((row) => row.id === value);
                if (template) setName(template.title);
              }}
              searchable
            />
            <TextInput
              label={t('drive.newFileName')}
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
            />
            {characters && characters.length > 0 && (
              <Select
                label={t('drive.templateCharacter')}
                description={t('drive.templateCharacterHint')}
                data={characters.map((row) => ({ value: row.id, label: row.title }))}
                value={characterId}
                onChange={setCharacterId}
                searchable
                clearable
              />
            )}
            <Text size="xs" c="dimmed">
              {t('drive.templateHint')}
            </Text>
          </>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={busy} disabled={!templateId} onClick={() => void create()}>
            {t('common.create')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
