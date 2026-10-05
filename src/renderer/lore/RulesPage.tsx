import {
  ActionIcon,
  Badge,
  Button,
  Grid,
  Group,
  Modal,
  NavLink,
  Paper,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  glossaryTermKind,
  readData,
  readSecret,
  ruleSectionKind,
  rulebookVersionKind,
  type RuleSnapshotSection,
} from '@core/kinds';
import { compareSections, type DiffPart } from '@core/lore/diff';
import { DEFAULT_LOOK, escapeHtml, richHtml, type PrintPiece } from '@core/print/html';
import type { RecordRow, RecordSecretRow } from '@core/model';
import { docText } from '@core/richtext';
import { compareCzech } from '@core/text';
import { formatDateTime } from '@core/format';
import { useTeam } from '../app/workspace';
import { RichText } from '../components/RichText';
import { ExportMenu } from '../print/components';
import { VisibilityEditor } from '../components/VisibilityEditor';
import { NONE, useRecords, useSecret, useTeamRecords } from '../data/hooks';
import { GameGate, inScope, useAskName, useRun } from '../tools/common';

/** The rulebook ("Pravidla"): sections, safety and conduct, glossary, versions. */
export function RulesPage() {
  const { t } = useTranslation();
  return (
    <GameGate>
      {(game) => (
        <Stack>
          <Title order={2}>{t('rules.title')}</Title>
          <Rulebooks game={game} />
        </Stack>
      )}
    </GameGate>
  );
}

function Rulebooks({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const ask = useAskName();
  const books = (useRecords('rulebook') ?? NONE).filter((row) => inScope(row, game));
  const [chosen, setChosen] = useState<string | null>(null);
  const book = books.find((row) => row.id === chosen) ?? books[0];

  const create = () =>
    ask(t('rules.newRulebook'), (name) => {
      void run(async () => {
        const row = await repo.createRecord({ kind: 'rulebook', title: name, game_id: game.id });
        setChosen(row.id);
      });
    });

  if (!book) {
    return (
      <Stack align="flex-start">
        <Text c="dimmed">{t('rules.none')}</Text>
        {canEdit && (
          <Button leftSection={<IconPlus size={14} />} onClick={create}>
            {t('rules.newRulebook')}
          </Button>
        )}
      </Stack>
    );
  }
  return (
    <Stack>
      {(books.length > 1 || canEdit) && (
        <Group>
          <Select
            aria-label={t('rules.rulebook')}
            data={books.map((row) => ({ value: row.id, label: row.title }))}
            value={book.id}
            onChange={setChosen}
            allowDeselect={false}
          />
          {canEdit && (
            <Button variant="subtle" leftSection={<IconPlus size={14} />} onClick={create}>
              {t('rules.newRulebook')}
            </Button>
          )}
        </Group>
      )}
      <Rulebook key={book.id} book={book} />
    </Stack>
  );
}

function Rulebook({ book }: { book: RecordRow }) {
  const { t } = useTranslation();
  const children = useTeamRecords((row) => row.parent_id === book.id, `rules:${book.id}`) ?? NONE;
  const sections = children
    .filter((row) => row.kind === 'rule_section')
    .sort((a, b) => readData(ruleSectionKind, a).order - readData(ruleSectionKind, b).order);
  const glossary = children
    .filter((row) => row.kind === 'glossary_term')
    .sort((a, b) => compareCzech(a.title, b.title));
  const versions = children
    .filter((row) => row.kind === 'rulebook_version')
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  /** The player-facing rulebook: chapters, safety and glossary, never the mechanics notes. */
  const playerPdf = (): PrintPiece[] => {
    const chapters = (type: 'rules' | 'safety') =>
      sections
        .filter((row) => readData(ruleSectionKind, row).type === type)
        .map(
          (row) =>
            `<h2>${escapeHtml(row.title)}</h2>${richHtml(readData(ruleSectionKind, row).body)}`,
        )
        .join('');
    const terms = glossary
      .map(
        (row) =>
          `<tr><td><strong>${escapeHtml(row.title)}</strong></td><td>${escapeHtml(readData(glossaryTermKind, row).definition)}</td></tr>`,
      )
      .join('');
    const safety = chapters('safety');
    return [
      {
        size: 'A4',
        look: DEFAULT_LOOK,
        html: `<div style="text-align:center;padding-top:80mm"><h1 style="font-size:2.4em">${escapeHtml(book.title)}</h1></div>`,
      },
      {
        size: 'A4',
        look: DEFAULT_LOOK,
        html: [
          chapters('rules'),
          safety ? `<h1>${escapeHtml(t('rules.tabs.safety'))}</h1>${safety}` : '',
          terms
            ? `<h1>${escapeHtml(t('rules.tabs.glossary'))}</h1><table class="list"><tbody>${terms}</tbody></table>`
            : '',
        ].join(''),
      },
    ];
  };

  return (
    <Tabs defaultValue="rules" keepMounted={false}>
      <Group justify="flex-end" mb="xs">
        <ExportMenu title={book.title} pdf={playerPdf} />
      </Group>
      <Tabs.List>
        <Tabs.Tab value="rules">{t('rules.tabs.rules')}</Tabs.Tab>
        <Tabs.Tab value="safety">{t('rules.tabs.safety')}</Tabs.Tab>
        <Tabs.Tab value="glossary">{t('rules.tabs.glossary')}</Tabs.Tab>
        <Tabs.Tab value="versions">{t('rules.tabs.versions')}</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="rules" pt="md">
        <Sections book={book} sections={sections} type="rules" />
      </Tabs.Panel>
      <Tabs.Panel value="safety" pt="md">
        <Text size="sm" c="dimmed" mb="sm">
          {t('rules.safetyIntro')}
        </Text>
        <Sections book={book} sections={sections} type="safety" />
      </Tabs.Panel>
      <Tabs.Panel value="glossary" pt="md">
        <Glossary book={book} terms={glossary} />
      </Tabs.Panel>
      <Tabs.Panel value="versions" pt="md">
        <Versions book={book} sections={sections} glossary={glossary} versions={versions} />
      </Tabs.Panel>
    </Tabs>
  );
}

function Sections({
  book,
  sections,
  type,
}: {
  book: RecordRow;
  sections: RecordRow[];
  type: 'rules' | 'safety';
}) {
  const { t } = useTranslation();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const ask = useAskName();
  const mine = sections.filter((row) => readData(ruleSectionKind, row).type === type);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = mine.find((row) => row.id === selectedId) ?? mine[0];
  const secret = useSecret(selected?.id);

  const move = (row: RecordRow, step: -1 | 1) => {
    const index = mine.indexOf(row);
    const other = mine[index + step];
    if (!other) return;
    // Renumber the whole list so equal orders cannot get stuck.
    const reordered = [...mine];
    reordered[index] = other;
    reordered[index + step] = row;
    void run(async () => {
      for (const [position, item] of reordered.entries()) {
        if (readData(ruleSectionKind, item).order !== position) {
          await repo.updateRecord(item.id, item.rev, { data: { ...item.data, order: position } });
        }
      }
    });
  };

  return (
    <Grid gap="md">
      <Grid.Col span={{ base: 12, md: 4 }}>
        <Paper withBorder p="sm">
          {canEdit && (
            <Button
              size="xs"
              mb="xs"
              leftSection={<IconPlus size={14} />}
              onClick={() =>
                ask(t('rules.newSection'), (name) => {
                  void run(async () => {
                    const row = await repo.createRecord({
                      kind: 'rule_section',
                      title: name,
                      game_id: book.game_id,
                      world_id: book.game_id ? null : book.world_id,
                      parent_id: book.id,
                      data: { type, order: sections.length },
                    });
                    setSelectedId(row.id);
                  });
                })
              }
            >
              {t('rules.newSection')}
            </Button>
          )}
          {mine.length === 0 && (
            <Text size="sm" c="dimmed">
              {t('rules.noSections')}
            </Text>
          )}
          {mine.map((row, index) => (
            <NavLink
              key={row.id}
              label={`${index + 1}. ${row.title}`}
              active={row.id === selected?.id}
              onClick={() => setSelectedId(row.id)}
              data-testid="rule-section"
              rightSection={
                canEdit ? (
                  <Group gap={0} wrap="nowrap">
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      aria-label={t('characters.moveUp')}
                      disabled={index === 0}
                      onClick={(event) => {
                        event.stopPropagation();
                        move(row, -1);
                      }}
                    >
                      <IconArrowUp size={12} />
                    </ActionIcon>
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      aria-label={t('characters.moveDown')}
                      disabled={index === mine.length - 1}
                      onClick={(event) => {
                        event.stopPropagation();
                        move(row, 1);
                      }}
                    >
                      <IconArrowDown size={12} />
                    </ActionIcon>
                  </Group>
                ) : null
              }
            />
          ))}
        </Paper>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 8 }}>
        {selected && (
          <SectionEditor
            key={`${selected.id}:${selected.rev}:${secret?.rev ?? 0}`}
            record={selected}
            secret={secret}
          />
        )}
      </Grid.Col>
    </Grid>
  );
}

function SectionEditor({
  record,
  secret,
}: {
  record: RecordRow;
  secret: RecordSecretRow | undefined;
}) {
  const { t } = useTranslation();
  const { repo, canEdit, isOrganizer } = useTeam();
  const run = useRun();
  const data = readData(ruleSectionKind, record);
  const mechanics = readSecret(ruleSectionKind, secret).mechanics;
  const [title, setTitle] = useState(record.title);
  const [body, setBody] = useState(data.body);
  const [notes, setNotes] = useState(mechanics);

  async function save() {
    await run(async () => {
      await repo.updateRecord(record.id, record.rev, {
        title: title.trim() || record.title,
        data: { ...record.data, body },
      });
      if (notes !== mechanics) await repo.saveSecret(record.id, { mechanics: notes });
    }, t('common.saved'));
  }
  useHotkeys([['mod+S', () => canEdit && void save()]], [], true);

  return (
    <Stack>
      <Paper withBorder p="md">
        <Stack>
          <TextInput
            size="md"
            aria-label={t('common.name')}
            value={title}
            readOnly={!canEdit}
            variant={canEdit ? 'default' : 'unstyled'}
            onChange={(event) => setTitle(event.currentTarget.value)}
            styles={{ input: { fontWeight: 700 } }}
          />
          <RichText
            value={body}
            onChange={setBody}
            editable={canEdit}
            minHeight={200}
            selfId={record.id}
          />
          {isOrganizer && (
            <Textarea
              label={t('rules.mechanics')}
              description={t('rules.mechanicsHint')}
              autosize
              minRows={2}
              readOnly={!canEdit}
              value={notes}
              onChange={(event) => setNotes(event.currentTarget.value)}
            />
          )}
          {canEdit && (
            <Group justify="space-between">
              <Button onClick={() => void save()}>{t('common.save')}</Button>
              <Button
                variant="subtle"
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={() => void run(() => repo.trashRecord(record))}
              >
                {t('worlds.trash')}
              </Button>
            </Group>
          )}
        </Stack>
      </Paper>
      {isOrganizer && (
        <Paper withBorder p="md">
          <VisibilityEditor record={record} />
        </Paper>
      )}
    </Stack>
  );
}

function Glossary({ book, terms }: { book: RecordRow; terms: RecordRow[] }) {
  const { t } = useTranslation();
  const { canEdit } = useTeam();
  const [editing, setEditing] = useState<RecordRow | 'new' | null>(null);
  return (
    <Stack maw={900}>
      {canEdit && (
        <Group>
          <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setEditing('new')}>
            {t('rules.newTerm')}
          </Button>
        </Group>
      )}
      {terms.length === 0 ? (
        <Text c="dimmed">{t('rules.noTerms')}</Text>
      ) : (
        <Table striped data-testid="glossary">
          <Table.Tbody>
            {terms.map((row) => (
              <Table.Tr
                key={row.id}
                style={{ cursor: canEdit ? 'pointer' : undefined }}
                onClick={() => canEdit && setEditing(row)}
              >
                <Table.Td w={220}>
                  <Text fw={600} size="sm">
                    {row.title}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{readData(glossaryTermKind, row).definition}</Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {editing && (
        <TermDialog
          book={book}
          record={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Stack>
  );
}

function TermDialog({
  book,
  record,
  onClose,
}: {
  book: RecordRow;
  record: RecordRow | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const run = useRun();
  const [term, setTerm] = useState(record?.title ?? '');
  const [definition, setDefinition] = useState(
    record ? readData(glossaryTermKind, record).definition : '',
  );
  async function save() {
    const ok = await run(() =>
      record
        ? repo.updateRecord(record.id, record.rev, {
            title: term.trim(),
            data: { ...record.data, definition },
          })
        : repo.createRecord({
            kind: 'glossary_term',
            title: term.trim(),
            game_id: book.game_id,
            world_id: book.game_id ? null : book.world_id,
            parent_id: book.id,
            visibility: book.visibility,
            data: { definition },
          }),
    );
    if (ok) onClose();
  }
  return (
    <Modal opened onClose={onClose} title={record ? t('rules.editTerm') : t('rules.newTerm')}>
      <Stack>
        <TextInput
          label={t('rules.term')}
          value={term}
          onChange={(event) => setTerm(event.currentTarget.value)}
          data-autofocus
        />
        <Textarea
          label={t('rules.definition')}
          autosize
          minRows={2}
          value={definition}
          onChange={(event) => setDefinition(event.currentTarget.value)}
        />
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
            <Button disabled={!term.trim()} onClick={() => void save()}>
              {t('common.save')}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}

function snapshot(sections: RecordRow[]): RuleSnapshotSection[] {
  return sections.map((row) => {
    const data = readData(ruleSectionKind, row);
    return { id: row.id, title: row.title, type: data.type, text: docText(data.body) };
  });
}

const CURRENT = 'current';

function Versions({
  book,
  sections,
  glossary,
  versions,
}: {
  book: RecordRow;
  sections: RecordRow[];
  glossary: RecordRow[];
  versions: RecordRow[];
}) {
  const { t } = useTranslation();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const ask = useAskName();
  const [from, setFrom] = useState<string | null>(versions[versions.length - 1]?.id ?? null);
  const [to, setTo] = useState<string>(CURRENT);

  const publish = () =>
    ask(
      t('rules.publish'),
      (label) => {
        void run(
          () =>
            repo.createRecord({
              kind: 'rulebook_version',
              title: `${book.title} ${label}`,
              game_id: book.game_id,
              world_id: book.game_id ? null : book.world_id,
              parent_id: book.id,
              data: {
                label,
                published_at: new Date().toISOString(),
                sections: snapshot(sections),
                glossary: glossary.map((row) => ({
                  term: row.title,
                  definition: readData(glossaryTermKind, row).definition,
                })),
              },
            }),
          t('rules.published', { label }),
        );
      },
      t('rules.versionPlaceholder'),
    );

  const sectionsOf = (id: string | null) => {
    if (id === CURRENT) return snapshot(sections);
    const version = versions.find((row) => row.id === id);
    return version ? readData(rulebookVersionKind, version).sections : [];
  };
  const options = [
    { value: CURRENT, label: t('rules.currentText') },
    ...versions.map((row) => {
      const data = readData(rulebookVersionKind, row);
      return {
        value: row.id,
        label: `${data.label} (${data.published_at ? formatDateTime(new Date(data.published_at)) : ''})`,
      };
    }),
  ];
  const changes = from ? compareSections(sectionsOf(from), sectionsOf(to)) : [];
  const changed = changes.filter((change) => change.status !== 'unchanged');

  return (
    <Stack maw={1000}>
      {canEdit && (
        <Group>
          <Button onClick={publish}>{t('rules.publish')}</Button>
          <Text size="sm" c="dimmed">
            {t('rules.publishHint')}
          </Text>
        </Group>
      )}
      {versions.length === 0 ? (
        <Text c="dimmed">{t('rules.noVersions')}</Text>
      ) : (
        <>
          <Group align="flex-end">
            <Select
              label={t('rules.compareFrom')}
              data={options}
              value={from}
              onChange={setFrom}
              allowDeselect={false}
            />
            <Select
              label={t('rules.compareTo')}
              data={options}
              value={to}
              onChange={(value) => value && setTo(value)}
              allowDeselect={false}
            />
          </Group>
          {changed.length === 0 ? (
            <Text c="dimmed" data-testid="no-changes">
              {t('rules.noChanges')}
            </Text>
          ) : (
            <Stack data-testid="changes">
              {changed.map((change) => (
                <Paper key={change.id} withBorder p="sm">
                  <Group gap="xs" mb={4}>
                    <Badge
                      size="sm"
                      variant="light"
                      color={
                        change.status === 'added'
                          ? 'teal'
                          : change.status === 'removed'
                            ? 'red'
                            : 'blue'
                      }
                    >
                      {t(`rules.changes.${change.status}`)}
                    </Badge>
                    <Text fw={600}>{change.title}</Text>
                    {change.status === 'changed' && change.oldTitle !== change.title && (
                      <Text size="xs" c="dimmed">
                        ({t('rules.renamedFrom', { title: change.oldTitle })})
                      </Text>
                    )}
                  </Group>
                  {change.status === 'changed' ? (
                    <DiffView parts={change.diff} />
                  ) : (
                    <Text size="sm" style={{ whiteSpace: 'pre-wrap' }} c="dimmed">
                      {change.text}
                    </Text>
                  )}
                </Paper>
              ))}
            </Stack>
          )}
        </>
      )}
    </Stack>
  );
}

function DiffView({ parts }: { parts: DiffPart[] }) {
  return (
    <Text size="sm" style={{ whiteSpace: 'pre-wrap' }} data-testid="diff">
      {parts.map((part, index) =>
        part.type === 'equal' ? (
          <span key={index}>{part.text}</span>
        ) : part.type === 'insert' ? (
          <ins
            key={index}
            style={{ background: 'var(--mantine-color-teal-light)', textDecoration: 'none' }}
          >
            {part.text}
          </ins>
        ) : (
          <del key={index} style={{ background: 'var(--mantine-color-red-light)' }}>
            {part.text}
          </del>
        ),
      )}
    </Text>
  );
}
