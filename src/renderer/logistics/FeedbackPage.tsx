import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  FileButton,
  Grid,
  Group,
  List,
  Modal,
  NavLink,
  Paper,
  Progress,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconFileImport, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { formatNumber } from '@core/format';
import { readData, surveyKind } from '@core/kinds';
import type { CsvTable } from '@core/logistics/csv';
import { identifyingColumns, summarizeQuestion, surveyData } from '@core/logistics/survey';
import type { RecordRow } from '@core/model';
import { useTeam } from '../app/workspace';
import { RichText } from '../components/RichText';
import { NONE, useGameRecords } from '../data/hooks';
import { GameGate, useRun } from '../tools/common';
import { readCsvFile } from './common';

/** Feedback ("Zpětná vazba"): post-game survey answers as a retrospective. */
export function FeedbackPage() {
  return <GameGate>{(game) => <Feedback game={game} />}</GameGate>;
}

function Feedback({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit } = useTeam();
  const surveys = useGameRecords('survey', game.id) ?? NONE;
  const selected = surveys.find((row) => row.id === id) ?? surveys[0];
  const [importing, setImporting] = useState<{ table: CsvTable; name: string } | null>(null);
  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>
          {t('feedback.title')} · {game.title}
        </Title>
        {canEdit && (
          <FileButton
            accept=".csv,text/csv"
            onChange={(file) => {
              if (file)
                void readCsvFile(file).then((table) => setImporting({ table, name: file.name }));
            }}
          >
            {(props) => (
              <Button leftSection={<IconFileImport size={14} />} {...props}>
                {t('feedback.import')}
              </Button>
            )}
          </FileButton>
        )}
      </Group>
      {surveys.length === 0 ? (
        <Text c="dimmed">{t('feedback.empty')}</Text>
      ) : (
        <Grid>
          <Grid.Col span={{ base: 12, md: 3 }}>
            {surveys.map((row) => (
              <NavLink
                key={row.id}
                label={row.title}
                description={t('feedback.responses', {
                  count: readData(surveyKind, row).responses.length,
                })}
                active={row.id === selected?.id}
                onClick={() => void navigate(`/zpetna-vazba/${row.id}`)}
              />
            ))}
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 9 }}>
            {selected && (
              <SurveyView key={`${selected.id}:${String(selected.rev)}`} record={selected} />
            )}
          </Grid.Col>
        </Grid>
      )}
      {importing && (
        <ImportDialog
          game={game}
          table={importing.table}
          source={importing.name}
          onClose={(created) => {
            setImporting(null);
            if (created) void navigate(`/zpetna-vazba/${created}`);
          }}
        />
      )}
    </Stack>
  );
}

function ImportDialog({
  game,
  table,
  source,
  onClose,
}: {
  game: RecordRow;
  table: CsvTable;
  source: string;
  onClose: (created?: string) => void;
}) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const run = useRun();
  const [name, setName] = useState<string>(t('feedback.defaultName'));
  const [keep, setKeep] = useState<number[]>(() => {
    const hidden = new Set(identifyingColumns(table.headers));
    return table.headers.flatMap((_, index) => (hidden.has(index) ? [] : [index]));
  });
  const data = surveyData(table, keep);
  async function save() {
    let created: RecordRow | undefined;
    const ok = await run(async () => {
      created = await repo.createRecord({
        kind: 'survey',
        title: name.trim() || t('feedback.defaultName'),
        game_id: game.id,
        data: { ...data, source, imported_at: new Date().toISOString() },
      });
    }, t('feedback.imported'));
    if (ok) onClose(created?.id);
  }
  return (
    <Modal opened onClose={() => onClose()} title={t('feedback.importTitle')} size="lg">
      <Stack>
        <TextInput
          label={t('feedback.name')}
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <Text size="sm" c="dimmed">
          {t('feedback.importHint')}
        </Text>
        <Checkbox.Group
          label={t('feedback.keep')}
          value={keep.map(String)}
          onChange={(values) => setKeep(values.map(Number))}
        >
          <Stack gap={4} mt={4}>
            {table.headers.map((header, index) => (
              <Checkbox key={index} value={String(index)} label={header || '?'} />
            ))}
          </Stack>
        </Checkbox.Group>
        <Text size="sm">{t('feedback.responses', { count: data.responses.length })}</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => onClose()}>
            {t('common.cancel')}
          </Button>
          <Button disabled={keep.length === 0} onClick={() => void save()}>
            {t('registrations.doImport')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function SurveyView({ record }: { record: RecordRow }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const data = readData(surveyKind, record);
  const [summary, setSummary] = useState(data.summary);
  return (
    <Stack>
      <Paper withBorder p="md">
        <Stack>
          <Group justify="space-between">
            <Title order={4}>{record.title}</Title>
            <Badge variant="light">
              {t('feedback.responses', { count: data.responses.length })}
            </Badge>
          </Group>
          <Text fw={600} size="sm">
            {t('feedback.summary')}
          </Text>
          <Text size="xs" c="dimmed">
            {t('feedback.summaryHint')}
          </Text>
          <RichText
            value={summary}
            onChange={setSummary}
            editable={canEdit}
            selfId={record.id}
            data-testid="survey-summary"
          />
          {canEdit && (
            <Group justify="space-between">
              <Button
                onClick={() =>
                  void run(
                    () =>
                      repo.updateRecord(record.id, record.rev, {
                        data: { ...record.data, summary },
                      }),
                    t('common.saved'),
                  )
                }
              >
                {t('common.save')}
              </Button>
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label={t('common.delete')}
                onClick={() =>
                  void run(() => repo.trashRecord(record)).then(
                    (ok) => ok && void navigate('/zpetna-vazba'),
                  )
                }
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          )}
        </Stack>
      </Paper>
      {data.questions.map((question, index) => {
        const result = summarizeQuestion(data.responses.map((row) => row[index] ?? ''));
        return (
          <Paper key={index} withBorder p="md" data-testid="survey-question">
            <Text fw={700} mb={4}>
              {question}
            </Text>
            {result.type === 'scale' && (
              <Text size="sm">
                {t('feedback.average', {
                  average: formatNumber(result.average),
                  min: formatNumber(result.min),
                  max: formatNumber(result.max),
                })}
              </Text>
            )}
            {result.type === 'choice' && (
              <Stack gap={4}>
                {result.options.map((option) => (
                  <Group key={option.value} gap="xs" wrap="nowrap">
                    <Text size="sm" w={200} truncate>
                      {option.value}
                    </Text>
                    <Progress value={(option.count / result.count) * 100} flex={1} />
                    <Text size="sm" w={30} ta="right">
                      {option.count}
                    </Text>
                  </Group>
                ))}
              </Stack>
            )}
            {result.type === 'text' && (
              <List size="sm" spacing={2}>
                {result.answers.map((answer, i) => (
                  <List.Item key={i}>{answer}</List.Item>
                ))}
              </List>
            )}
          </Paper>
        );
      })}
    </Stack>
  );
}
