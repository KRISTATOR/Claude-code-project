import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconEyeOff } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { checkConsistency, type Finding } from '@core/lore/consistency';
import type { RecordRow } from '@core/model';
import { recordLink } from '../app/links';
import { useTeam, useWorkspace } from '../app/workspace';
import { NONE, useTeamRecords } from '../data/hooks';
import { GameGate, useRun } from '../tools/common';

/** The consistency checker ("Kontrola"), with an honest scope (docs/PLAN.md §1.9). */
export function ConsistencyPage() {
  const { t } = useTranslation();
  return (
    <GameGate>
      {(game) => (
        <Stack maw={1000}>
          <Title order={2}>{t('consistency.title')}</Title>
          <Text size="sm" c="dimmed">
            {t('consistency.intro')}
          </Text>
          <Checker game={game} />
        </Stack>
      )}
    </GameGate>
  );
}

function Checker({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { cache } = useWorkspace();
  const { team, repo, canEdit } = useTeam();
  const run = useRun();
  const metaKey = `consistencyIgnored:${team.id}`;
  const [ignored, setIgnored] = useState<string[]>([]);
  const [showIgnored, setShowIgnored] = useState(false);
  useEffect(() => {
    void cache.getMeta<string[]>(metaKey).then((saved) => setIgnored(saved ?? []));
  }, [cache, metaKey]);

  const records =
    useTeamRecords(
      (row) =>
        row.id === game.id ||
        row.id === game.world_id ||
        row.game_id === game.id ||
        (row.game_id === null && row.world_id === game.world_id),
      `consistency:${game.id}`,
      { includeDeleted: true },
    ) ?? NONE;
  const byId = useMemo(() => new Map(records.map((row) => [row.id, row])), [records]);
  const findings = useMemo(() => checkConsistency(records), [records]);
  const visible = findings.filter((finding) => showIgnored || !ignored.includes(finding.key));

  const ignore = (key: string) => {
    const next = ignored.includes(key) ? ignored.filter((item) => item !== key) : [...ignored, key];
    setIgnored(next);
    void cache.setMeta(metaKey, next);
  };
  const link = (id: string) => {
    const row = byId.get(id);
    return row ? (
      <Anchor component={Link} to={recordLink(row)}>
        {row.title}
      </Anchor>
    ) : (
      <Text span c="dimmed">
        ?
      </Text>
    );
  };

  const describe = (finding: Finding): ReactNode => {
    switch (finding.type) {
      case 'duplicate_name':
        return (
          <>
            {t('consistency.duplicate', { name: finding.name })} {link(finding.ids[0])} ·{' '}
            {link(finding.ids[1])}
          </>
        );
      case 'similar_names':
        return (
          <>
            {t('consistency.similar', { a: finding.words[0], b: finding.words[1] })}{' '}
            {link(finding.ids[0])} · {link(finding.ids[1])}
          </>
        );
      case 'dangling_link':
        return (
          <>
            {link(finding.from_id)}:{' '}
            {t(finding.trashed ? 'consistency.linkTrashed' : 'consistency.linkMissing', {
              label: finding.label || '?',
            })}
          </>
        );
      case 'canon_conflict':
        return (
          <>
            {link(finding.subject_id)}:{' '}
            {t('consistency.canonConflict', { expected: finding.expected, actual: finding.actual })}{' '}
            ({link(finding.canon_id)})
          </>
        );
      case 'canon_contradiction':
        return (
          <>
            {t('consistency.canonContradiction', {
              subject: finding.subject,
              a: finding.values[0],
              b: finding.values[1],
            })}{' '}
            {link(finding.ids[0])} · {link(finding.ids[1])}
          </>
        );
      case 'canon_missing_subject':
        return (
          <>
            {link(finding.canon_id)}: {t('consistency.canonMissing')}
          </>
        );
    }
  };

  async function toIssue(finding: Finding) {
    const text = document.querySelector(`[data-finding="${CSS.escape(finding.key)}"]`)?.textContent;
    await run(
      () =>
        repo.createRecord({
          kind: 'issue',
          title: t(`consistency.types.${finding.type}`),
          game_id: game.id,
          data: { description: text ?? '', related_ids: relatedIds(finding) },
        }),
      t('consistency.issueCreated'),
    );
  }

  return (
    <Stack>
      <Group justify="space-between">
        {findings.length === 0 ? (
          <Alert
            color="teal"
            variant="light"
            icon={<IconCheck size={16} />}
            data-testid="consistency-ok"
          >
            {t('consistency.ok')}
          </Alert>
        ) : (
          <Text fw={600} data-testid="consistency-count">
            {t('consistency.count', { count: visible.length })}
          </Text>
        )}
        <Switch
          label={t('consistency.showIgnored')}
          checked={showIgnored}
          onChange={(event) => setShowIgnored(event.currentTarget.checked)}
        />
      </Group>
      {visible.map((finding) => (
        <Paper key={finding.key} withBorder p="sm" data-testid="finding" data-type={finding.type}>
          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <Group gap="xs" wrap="nowrap" align="flex-start">
              <IconAlertTriangle size={18} color="var(--mantine-color-orange-6)" />
              <Stack gap={2}>
                <Badge size="xs" variant="light" color="orange">
                  {t(`consistency.types.${finding.type}`)}
                </Badge>
                <Text size="sm" data-finding={finding.key}>
                  {describe(finding)}
                </Text>
              </Stack>
            </Group>
            <Group gap={4} wrap="nowrap">
              {canEdit && (
                <Button size="compact-xs" variant="light" onClick={() => void toIssue(finding)}>
                  {t('consistency.toIssue')}
                </Button>
              )}
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                leftSection={<IconEyeOff size={12} />}
                onClick={() => ignore(finding.key)}
              >
                {ignored.includes(finding.key)
                  ? t('consistency.unignore')
                  : t('consistency.ignore')}
              </Button>
            </Group>
          </Group>
        </Paper>
      ))}
      <Text size="xs" c="dimmed">
        {t('consistency.scope')}
      </Text>
    </Stack>
  );
}

function relatedIds(finding: Finding): string[] {
  switch (finding.type) {
    case 'duplicate_name':
    case 'similar_names':
    case 'canon_contradiction':
      return [...finding.ids];
    case 'dangling_link':
      return [finding.from_id];
    case 'canon_conflict':
      return [finding.subject_id, finding.canon_id];
    case 'canon_missing_subject':
      return [finding.canon_id];
  }
}
