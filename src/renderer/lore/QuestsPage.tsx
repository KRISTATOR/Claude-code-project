import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { questKind, questStatuses, questTypes, readData, readSecret } from '@core/kinds';
import type { RecordRow } from '@core/model';
import { escapeHtml, textHtml, type PrintPiece } from '@core/print/html';
import { useTeam } from '../app/workspace';
import { ExportMenu } from '../print/components';
import { useLinkTargets } from '../components/RichText';
import { VisibilityEditor } from '../components/VisibilityEditor';
import { NONE, useGameRecords, useSecret } from '../data/hooks';
import { GameGate, useRun } from '../tools/common';

const STATUS_COLOR = {
  draft: 'gray',
  open: 'blue',
  taken: 'yellow',
  done: 'teal',
  failed: 'red',
} as const;

/** Quests and the job board ("Úkoly a nástěnka"). */
export function QuestsPage() {
  const { t } = useTranslation();
  return (
    <GameGate>
      {(game) => (
        <Stack>
          <Title order={2}>
            {t('quests.title')} · {game.title}
          </Title>
          <Quests game={game} />
        </Stack>
      )}
    </GameGate>
  );
}

function Quests({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { canEdit, isOrganizer } = useTeam();
  const targets = useLinkTargets();
  const [params, setParams] = useSearchParams();
  const [type, setType] = useState<string>('all');
  const [creating, setCreating] = useState(false);
  const quests = (useGameRecords('quest', game.id) ?? NONE)
    .map((row) => ({ row, data: readData(questKind, row) }))
    .filter(({ data }) => type === 'all' || data.type === type)
    // Players see posted offers only, never drafts.
    .filter(({ data }) => isOrganizer || data.status !== 'draft');
  const openId = params.get('q');
  const open = quests.find(({ row }) => row.id === openId)?.row ?? null;

  return (
    <Stack>
      <Group justify="space-between">
        <SegmentedControl
          value={type}
          onChange={setType}
          data={[
            { value: 'all', label: t('quests.all') },
            { value: 'quest', label: t('quests.types.quest') },
            { value: 'job', label: t('quests.types.job') },
          ]}
        />
        {canEdit && (
          <Button leftSection={<IconPlus size={14} />} onClick={() => setCreating(true)}>
            {t('quests.newQuest')}
          </Button>
        )}
      </Group>
      {quests.length === 0 ? (
        <Text c="dimmed">{t('quests.empty')}</Text>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {quests.map(({ row, data }) => (
            <Card
              key={row.id}
              withBorder
              data-testid="quest"
              style={{ cursor: canEdit ? 'pointer' : undefined }}
              onClick={() => canEdit && setParams({ q: row.id })}
            >
              <Group justify="space-between" mb={4} wrap="nowrap">
                <Text fw={700}>{row.title}</Text>
                <Badge size="sm" variant="light" color={STATUS_COLOR[data.status]}>
                  {t(`quests.statuses.${data.status}`)}
                </Badge>
              </Group>
              <Badge size="xs" variant="outline" mb={6}>
                {t(`quests.types.${data.type}`)}
              </Badge>
              {data.description && (
                <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                  {data.description}
                </Text>
              )}
              {(data.giver_id || data.giver_name) && (
                <Text size="xs" c="dimmed" mt={6}>
                  {t('quests.giver')}:{' '}
                  {targets.find((target) => target.id === data.giver_id)?.title ?? data.giver_name}
                </Text>
              )}
              {data.reward && (
                <Text size="xs" c="dimmed">
                  {t('quests.reward')}: {data.reward}
                </Text>
              )}
            </Card>
          ))}
        </SimpleGrid>
      )}
      {(creating || open) && (
        <QuestDialog
          key={open?.id ?? 'new'}
          game={game}
          record={creating ? null : open}
          onClose={() => {
            setCreating(false);
            setParams({});
          }}
        />
      )}
    </Stack>
  );
}

/** The in-world notice for the job board (A5). */
function questNotice(
  title: string,
  fields: { description: string; conditions: string; reward: string },
  giver: string,
): PrintPiece {
  return {
    size: 'A5',
    look: { fontId: 'grenze-gotisch', ink: '#2a1a0a', paper: 'aged', sizePt: 14 },
    html: [
      `<h1 style="text-align:center">${escapeHtml(title)}</h1>`,
      textHtml(fields.description),
      fields.conditions ? `<p><em>${escapeHtml(fields.conditions)}</em></p>` : '',
      fields.reward
        ? `<p style="text-align:center;font-size:1.3em"><strong>${escapeHtml(fields.reward)}</strong></p>`
        : '',
      giver ? `<div class="signature">${escapeHtml(giver)}</div>` : '',
    ].join(''),
  };
}

function QuestDialog({
  game,
  record,
  onClose,
}: {
  game: RecordRow;
  record: RecordRow | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { repo, isOrganizer } = useTeam();
  const run = useRun();
  const secret = useSecret(record?.id);
  const targets = useLinkTargets().filter((target) =>
    ['character', 'npc', 'faction', 'page'].includes(target.kind),
  );
  const phases = useGameRecords('phase', game.id) ?? NONE;
  const threads = useGameRecords('plot_thread', game.id) ?? NONE;
  const resolution = readSecret(questKind, secret).resolution;
  const [title, setTitle] = useState(record?.title ?? '');
  const [fields, setFields] = useState(readData(questKind, record ?? { data: {} }));
  const [secretText, setSecretText] = useState<string | null>(null);
  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((current) => ({ ...current, [key]: value }));
  const giverName =
    targets.find((target) => target.id === fields.giver_id)?.title ?? fields.giver_name;

  async function save() {
    const ok = await run(async () => {
      const saved = record
        ? await repo.updateRecord(record.id, record.rev, {
            title: title.trim(),
            data: { ...record.data, ...fields },
          })
        : await repo.createRecord({
            kind: 'quest',
            title: title.trim(),
            game_id: game.id,
            data: fields,
          });
      if (secretText !== null && secretText !== resolution) {
        await repo.saveSecret(saved.id, { resolution: secretText });
      }
    });
    if (ok) onClose();
  }

  return (
    <Modal
      opened
      onClose={onClose}
      title={record ? t('quests.edit') : t('quests.newQuest')}
      size="lg"
    >
      <Stack>
        <TextInput
          label={t('common.name')}
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          data-autofocus
        />
        <Group grow>
          <Select
            label={t('quests.type')}
            data={questTypes.map((value) => ({ value, label: t(`quests.types.${value}`) }))}
            value={fields.type}
            onChange={(value) => value && set('type', value)}
            allowDeselect={false}
          />
          <Select
            label={t('quests.status')}
            data={questStatuses.map((value) => ({ value, label: t(`quests.statuses.${value}`) }))}
            value={fields.status}
            onChange={(value) => value && set('status', value)}
            allowDeselect={false}
          />
        </Group>
        <Textarea
          label={t('quests.description')}
          description={t('quests.descriptionHint')}
          autosize
          minRows={3}
          value={fields.description}
          onChange={(event) => set('description', event.currentTarget.value)}
        />
        <Group grow align="flex-start">
          <Select
            label={t('quests.giver')}
            data={targets.map((target) => ({ value: target.id, label: target.title }))}
            value={fields.giver_id}
            onChange={(value) => set('giver_id', value)}
            searchable
            clearable
          />
          {!fields.giver_id && (
            <TextInput
              label={t('quests.giverName')}
              value={fields.giver_name}
              onChange={(event) => set('giver_name', event.currentTarget.value)}
            />
          )}
          <TextInput
            label={t('quests.reward')}
            value={fields.reward}
            onChange={(event) => set('reward', event.currentTarget.value)}
          />
        </Group>
        <TextInput
          label={t('quests.conditions')}
          value={fields.conditions}
          onChange={(event) => set('conditions', event.currentTarget.value)}
        />
        <Group grow>
          <Select
            label={t('runOfShow.phase')}
            description={t('quests.phaseHint')}
            data={phases.map((phase) => ({ value: phase.id, label: phase.title }))}
            value={fields.phase_id}
            onChange={(value) => set('phase_id', value)}
            clearable
          />
          <Select
            label={t('kinds.plot_thread')}
            data={threads.map((thread) => ({ value: thread.id, label: thread.title }))}
            value={fields.thread_id}
            onChange={(value) => set('thread_id', value)}
            clearable
          />
        </Group>
        {isOrganizer && (
          <Textarea
            label={t('quests.resolution')}
            description={t('quests.resolutionHint')}
            autosize
            minRows={2}
            value={secretText ?? resolution}
            onChange={(event) => setSecretText(event.currentTarget.value)}
          />
        )}
        {record && isOrganizer && <VisibilityEditor record={record} />}
        <Group>
          <ExportMenu
            title={title || t('kinds.quest')}
            pdf={() => [questNotice(title, fields, giverName)]}
          />
          <Text size="xs" c="dimmed">
            {t('quests.noticeHint')}
          </Text>
        </Group>
        <Group justify="space-between">
          {record ? (
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label={t('common.delete')}
              onClick={() => void run(() => repo.trashRecord(record)).then((ok) => ok && onClose())}
            >
              <IconTrash size={16} />
            </ActionIcon>
          ) : (
            <span />
          )}
          <Group>
            <Button variant="default" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button disabled={!title.trim()} onClick={() => void save()}>
              {t('common.save')}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
