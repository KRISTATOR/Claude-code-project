import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
  useComputedColorScheme,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import cytoscape from 'cytoscape';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { weaklyTied } from '@core/characters/graph';
import { knownBy, readData, relationshipKind } from '@core/kinds';
import type { RecordRow } from '@core/model';
import { useTeam } from '../app/workspace';
import { NONE, useGameRecords } from '../data/hooks';
import { Field, GameGate, useRun } from './common';

export function RelationshipsPage() {
  const { t } = useTranslation();
  return (
    <GameGate>
      {(game) => (
        <Stack>
          <Title order={2}>
            {t('relationships.title')} · {game.title}
          </Title>
          <Relationships game={game} />
        </Stack>
      )}
    </GameGate>
  );
}

function Relationships({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { canEdit, isOrganizer } = useTeam();
  const characters = useGameRecords('character', game.id) ?? NONE;
  const relationships = useGameRecords('relationship', game.id) ?? NONE;
  const [minimum, setMinimum] = useState(2);
  const [editing, setEditing] = useState<RecordRow | 'new' | null>(null);
  const ties = relationships.map((row) => readData(relationshipKind, row));
  const weak = weaklyTied(
    characters.map((row) => row.id),
    ties,
    minimum,
  );
  const nameOf = (id: string) => characters.find((row) => row.id === id)?.title ?? '?';
  /** Players may not read the other side; its name is kept in the title ("A → B"). */
  const sideName = (row: RecordRow, id: string, side: 0 | 1) =>
    characters.find((character) => character.id === id)?.title ??
    row.title.split(' → ')[side] ??
    '?';

  return (
    <Stack>
      {isOrganizer && (
        <Group align="flex-end">
          <NumberInput
            label={t('relationships.minimum')}
            min={0}
            max={20}
            value={minimum}
            onChange={(value) => setMinimum(Number(value) || 0)}
            w={160}
          />
          <Alert
            color={weak.length > 0 ? 'orange' : 'teal'}
            variant="light"
            p="xs"
            flex={1}
            data-testid="weak-ties"
          >
            <Text size="sm">
              {weak.length > 0
                ? t('relationships.weak', { count: minimum, names: weak.map(nameOf).join(', ') })
                : t('relationships.noWeak', { count: minimum })}
            </Text>
          </Alert>
          {canEdit && (
            <Button leftSection={<IconPlus size={14} />} onClick={() => setEditing('new')}>
              {t('relationships.newRelationship')}
            </Button>
          )}
        </Group>
      )}
      <Tabs defaultValue="graph" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="graph">{t('relationships.graph')}</Tabs.Tab>
          <Tabs.Tab value="list">{t('relationships.list')}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="graph" pt="md">
          <Graph
            characters={characters}
            relationships={relationships}
            weak={weak.join(',')}
            onEdge={(row) => canEdit && setEditing(row)}
          />
        </Tabs.Panel>
        <Tabs.Panel value="list" pt="md">
          {relationships.length === 0 ? (
            <Text c="dimmed">{t('relationships.empty')}</Text>
          ) : (
            <Table striped highlightOnHover data-testid="relationship-list">
              <Table.Tbody>
                {relationships.map((row) => {
                  const data = readData(relationshipKind, row);
                  return (
                    <Table.Tr
                      key={row.id}
                      style={{ cursor: canEdit ? 'pointer' : undefined }}
                      onClick={() => canEdit && setEditing(row)}
                    >
                      <Table.Td>{sideName(row, data.from_id, 0)}</Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          {data.label}
                        </Text>
                        {data.note && (
                          <Text size="xs" c="dimmed">
                            {data.note}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>{sideName(row, data.to_id, 1)}</Table.Td>
                      <Table.Td>
                        {data.known_by !== 'both' && (
                          <Badge size="xs" color="grape" variant="light">
                            {t(`relationships.knownByOptions.${data.known_by}`)}
                          </Badge>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          )}
        </Tabs.Panel>
      </Tabs>
      {editing && (
        <RelationshipDialog
          game={game}
          characters={characters}
          record={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Stack>
  );
}

/** Characters as nodes, relationships as labelled edges; one-sided edges are dashed. */
function Graph({
  characters,
  relationships,
  weak,
  onEdge,
}: {
  characters: RecordRow[];
  relationships: RecordRow[];
  /** Ids of weakly tied characters, comma-separated (a stable memo key). */
  weak: string;
  onEdge: (record: RecordRow) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  // Kept in a ref so a new callback does not rebuild (and re-lay out) the graph.
  const onEdgeRef = useRef(onEdge);
  useEffect(() => {
    onEdgeRef.current = onEdge;
  });
  const navigate = useNavigate();
  const scheme = useComputedColorScheme('light');
  const elements = useMemo(() => {
    const ids = new Set(characters.map((row) => row.id));
    const weakIds = new Set(weak.split(','));
    return [
      ...characters.map((row) => ({
        data: { id: row.id, label: row.title, weak: weakIds.has(row.id) ? 1 : 0 },
      })),
      ...relationships
        .map((row) => ({ row, data: readData(relationshipKind, row) }))
        .filter(({ data }) => ids.has(data.from_id) && ids.has(data.to_id))
        .map(({ row, data }) => ({
          data: {
            id: row.id,
            source: data.from_id,
            target: data.to_id,
            label: data.label,
            secret: data.known_by === 'both' ? 0 : 1,
          },
        })),
    ];
  }, [characters, relationships, weak]);

  useEffect(() => {
    if (!container.current) return;
    const text = scheme === 'dark' ? '#e9ecef' : '#212529';
    const graph = cytoscape({
      container: container.current,
      elements,
      // A force layout clumps a handful of characters together; a circle reads better.
      layout:
        characters.length <= 8
          ? {
              name: 'circle',
              padding: 60,
              avoidOverlap: true,
              radius: Math.max(90, characters.length * 35),
            }
          : {
              name: 'cose',
              animate: false,
              nodeRepulsion: () => 9000,
              idealEdgeLength: () => 120,
              padding: 30,
            },
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'background-color': '#12b886',
            color: text,
            'font-size': 12,
            'text-valign': 'bottom',
            'text-margin-y': 4,
            'text-background-color': scheme === 'dark' ? '#242424' : '#ffffff',
            'text-background-opacity': 0.9,
            'text-background-padding': '2px',
            width: 22,
            height: 22,
          },
        },
        {
          selector: 'node[weak = 1]',
          style: { 'background-color': '#fd7e14', 'border-width': 2, 'border-color': '#e8590c' },
        },
        {
          selector: 'edge',
          style: {
            label: 'data(label)',
            'font-size': 10,
            color: text,
            'text-rotation': 'autorotate',
            'text-background-color': scheme === 'dark' ? '#242424' : '#ffffff',
            'text-background-opacity': 0.8,
            'curve-style': 'bezier',
            'control-point-step-size': 50,
            'target-arrow-shape': 'triangle',
            'line-color': '#adb5bd',
            'target-arrow-color': '#adb5bd',
            width: 1.5,
          },
        },
        {
          selector: 'edge[secret = 1]',
          style: {
            'line-style': 'dashed',
            'line-color': '#be4bdb',
            'target-arrow-color': '#be4bdb',
          },
        },
      ],
    });
    // With only a few characters, fitting the view would blow them up.
    const capZoom = () => {
      if (graph.zoom() > 1.2) {
        graph.zoom(1.2);
        graph.center();
      }
    };
    capZoom();
    graph.on('layoutstop', capZoom);
    graph.on(
      'tap',
      'node',
      (event) => void navigate(`/postavy/${(event.target as cytoscape.NodeSingular).id()}`),
    );
    graph.on('tap', 'edge', (event) => {
      const row = relationships.find(
        (item) => item.id === (event.target as cytoscape.EdgeSingular).id(),
      );
      if (row) onEdgeRef.current(row);
    });
    return () => graph.destroy();
  }, [elements, scheme, navigate, relationships, characters.length]);

  return <Paper withBorder h={540} ref={container} data-testid="relationship-graph" />;
}

function RelationshipDialog({
  game,
  characters,
  record,
  onClose,
}: {
  game: RecordRow;
  characters: RecordRow[];
  record: RecordRow | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const run = useRun();
  const initial = readData(relationshipKind, record ?? { data: {} });
  const [fields, setFields] = useState(initial);
  const options = characters.map((row) => ({ value: row.id, label: row.title }));
  const valid =
    fields.from_id && fields.to_id && fields.from_id !== fields.to_id && fields.label.trim();

  async function save() {
    const title = `${characters.find((row) => row.id === fields.from_id)?.title ?? ''} → ${
      characters.find((row) => row.id === fields.to_id)?.title ?? ''
    }`;
    const ok = await run(() =>
      record
        ? repo.updateRecord(record.id, record.rev, { title, data: { ...record.data, ...fields } })
        : repo.createRecord({ kind: 'relationship', title, game_id: game.id, data: fields }),
    );
    if (ok) onClose();
  }

  return (
    <Modal
      opened
      onClose={onClose}
      title={record ? t('relationships.title') : t('relationships.newRelationship')}
    >
      <Stack>
        <Select
          label={t('relationships.from')}
          data={options}
          value={fields.from_id || null}
          onChange={(value) => setFields((f) => ({ ...f, from_id: value ?? '' }))}
          searchable
        />
        <TextInput
          label={t('relationships.label')}
          placeholder={t('relationships.labelPlaceholder')}
          value={fields.label}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setFields((f) => ({ ...f, label: value }));
          }}
        />
        <Select
          label={t('relationships.to')}
          data={options}
          value={fields.to_id || null}
          onChange={(value) => setFields((f) => ({ ...f, to_id: value ?? '' }))}
          searchable
        />
        <Field
          label={t('relationships.note')}
          value={fields.note}
          onValue={(value) => setFields((f) => ({ ...f, note: value }))}
        />
        <Select
          label={t('relationships.knownBy')}
          description={fields.known_by !== 'both' ? t('relationships.secretHint') : undefined}
          data={knownBy.map((value) => ({
            value,
            label: t(`relationships.knownByOptions.${value}`),
          }))}
          value={fields.known_by}
          onChange={(value) => value && setFields((f) => ({ ...f, known_by: value }))}
          allowDeselect={false}
        />
        <Group justify="space-between">
          {record ? (
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label={t('relationships.delete')}
              onClick={() => {
                void run(() => repo.deleteRecord(record.id)).then((ok) => ok && onClose());
              }}
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
            <Button disabled={!valid} onClick={() => void save()}>
              {t('common.save')}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
