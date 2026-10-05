import {
  ActionIcon,
  Badge,
  Button,
  ColorInput,
  Grid,
  Group,
  Menu,
  Modal,
  MultiSelect,
  NavLink,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useElementSize, useHotkeys } from '@mantine/hooks';
import {
  IconDownload,
  IconEye,
  IconEyeOff,
  IconLock,
  IconPlus,
  IconSettings,
  IconTrash,
} from '@tabler/icons-react';
import type Konva from 'konva';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Circle,
  Group as KGroup,
  Image as KImage,
  Layer,
  Line,
  Rect,
  Stage,
  Text as KText,
} from 'react-konva';
import { useNavigate, useParams } from 'react-router';
import {
  fileKind,
  mapKind,
  mapLayerKind,
  mapObjectTypes,
  mapTypes,
  markerIcons,
  readData,
  type MapObject,
  type MapObjectType,
} from '@core/kinds';
import type { RecordRow } from '@core/model';
import { useTeam } from '../app/workspace';
import { useLinkTargets } from '../components/RichText';
import { VisibilityEditor } from '../components/VisibilityEditor';
import { NONE, useGameRecords, useRecord, useRecords, useTeamRecords } from '../data/hooks';
import { useDrive } from '../drive/context';
import { save } from '../print/service';
import { GameGate, inScope, useRun } from '../tools/common';

type Tool = 'select' | MapObjectType;

const ICON_GLYPH: Record<(typeof markerIcons)[number], string> = {
  pin: '●',
  danger: '!',
  water: '≈',
  fire: '▲',
  treasure: '◆',
  tent: '⌂',
  flag: '⚑',
};
const POLY: ReadonlySet<MapObjectType> = new Set(['zone', 'path', 'rope']);

/** Maps ("Mapy"): the venue and in-world maps, with layers and links. */
export function MapsPage() {
  return <GameGate>{(game) => <Maps game={game} />}</GameGate>;
}

function Maps({ game }: { game: RecordRow }) {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { repo, canEdit } = useTeam();
  const run = useRun();
  const maps = (useRecords('map') ?? NONE).filter((row) => inScope(row, game));
  const selected = useRecord(id);
  const [creating, setCreating] = useState(false);

  return (
    <Grid gap="md">
      <Grid.Col span={{ base: 12, md: 2 }}>
        <Paper withBorder p="sm">
          <Title order={4} mb="xs">
            {t('maps.title')}
          </Title>
          {canEdit && (
            <Button
              size="xs"
              mb="xs"
              leftSection={<IconPlus size={14} />}
              onClick={() => setCreating(true)}
            >
              {t('maps.newMap')}
            </Button>
          )}
          {maps.length === 0 && (
            <Text size="sm" c="dimmed">
              {t('maps.empty')}
            </Text>
          )}
          {maps.map((row) => (
            <NavLink
              key={row.id}
              label={row.title}
              description={t(`maps.types.${readData(mapKind, row).type}`)}
              active={row.id === id}
              onClick={() => void navigate(`/mapy/${row.id}`)}
            />
          ))}
        </Paper>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 10 }}>
        {selected && selected.kind === 'map' ? (
          <MapEditor key={selected.id} game={game} map={selected} />
        ) : (
          <Text c="dimmed">{t('maps.selectHint')}</Text>
        )}
      </Grid.Col>
      {creating && (
        <NewMapDialog
          onClose={() => setCreating(false)}
          onCreate={(title, type) =>
            void run(async () => {
              const row = await repo.createRecord({
                kind: 'map',
                title,
                game_id: game.id,
                data: { type },
              });
              await repo.createRecord({
                kind: 'map_layer',
                title: t('maps.baseLayer'),
                game_id: game.id,
                parent_id: row.id,
                data: { order: 0 },
              });
              setCreating(false);
              void navigate(`/mapy/${row.id}`);
            })
          }
        />
      )}
    </Grid>
  );
}

function NewMapDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (title: string, type: (typeof mapTypes)[number]) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<(typeof mapTypes)[number]>('world');
  return (
    <Modal opened onClose={onClose} title={t('maps.newMap')}>
      <Stack>
        <TextInput
          label={t('common.name')}
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          data-autofocus
        />
        <SegmentedControl
          value={type}
          onChange={(value) => setType(value)}
          data={mapTypes.map((value) => ({ value, label: t(`maps.types.${value}`) }))}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={!title.trim()} onClick={() => onCreate(title.trim(), type)}>
            {t('common.create')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** Loads an image file from the drive as an <img> for the canvas. */
function useBackground(fileId: string | null): HTMLImageElement | null {
  const { files } = useDrive();
  const record = useRecord(fileId);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!record) return;
    const life = { url: '', cancelled: false };
    void files.getBytes(record).then(({ data }) => {
      if (life.cancelled) return;
      life.url = URL.createObjectURL(
        new Blob([new Uint8Array(data)], { type: readData(fileKind, record).mime }),
      );
      const element = new window.Image();
      element.onload = () => !life.cancelled && setImage(element);
      element.src = life.url;
    });
    return () => {
      life.cancelled = true;
      if (life.url) URL.revokeObjectURL(life.url);
    };
  }, [files, record]);
  return record ? image : null;
}

function MapEditor({ game, map }: { game: RecordRow; map: RecordRow }) {
  const { t } = useTranslation();
  const { repo, canEdit, isOrganizer } = useTeam();
  const run = useRun();
  const data = readData(mapKind, map);
  const layerRows = (
    useTeamRecords(
      (row) => row.kind === 'map_layer' && row.parent_id === map.id,
      `layers:${map.id}`,
    ) ?? NONE
  )
    .slice()
    .sort((a, b) => readData(mapLayerKind, a).order - readData(mapLayerKind, b).order);
  /** Edited objects per layer id (until saved). */
  const [edits, setEdits] = useState<Record<string, MapObject[]>>({});
  const [hidden, setHidden] = useState<string[]>([]);
  const [activeLayer, setActiveLayer] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState<number[] | null>(null);
  const [view, setView] = useState({ scale: 0.6, x: 0, y: 0 });
  const [settings, setSettings] = useState(false);
  const [layerVisibility, setLayerVisibility] = useState<string | null>(null);
  const stageRef = useRef<Konva.Stage>(null);
  /** The canvas fills its column. */
  const { ref: canvasRef, width: canvasWidth } = useElementSize();
  const background = useBackground(data.background_file_id);
  const layer = layerRows.find((row) => row.id === activeLayer) ?? layerRows[0];
  const objectsOf = (row: RecordRow) => edits[row.id] ?? readData(mapLayerKind, row).objects;
  const dirty = Object.keys(edits).length > 0;
  const selected = layer ? objectsOf(layer).find((object) => object.id === selectedId) : undefined;

  const change = (objects: MapObject[]) =>
    layer && setEdits((current) => ({ ...current, [layer.id]: objects }));
  const update = (objectId: string, patch: Partial<MapObject>) =>
    layer &&
    change(
      objectsOf(layer).map((object) => (object.id === objectId ? { ...object, ...patch } : object)),
    );

  async function saveAll() {
    await run(async () => {
      for (const row of layerRows) {
        const objects = edits[row.id];
        if (objects) await repo.updateRecord(row.id, row.rev, { data: { ...row.data, objects } });
      }
      setEdits({});
    }, t('common.saved'));
  }
  useHotkeys(
    [
      ['mod+S', () => canEdit && dirty && void saveAll()],
      ['Escape', () => (drawing ? setDrawing(null) : setSelectedId(null))],
      [
        'Delete',
        () =>
          selected &&
          layer &&
          change(objectsOf(layer).filter((object) => object.id !== selected.id)),
      ],
      ['Enter', () => finishDrawing()],
    ],
    ['INPUT', 'TEXTAREA'],
  );

  function newObject(type: MapObjectType, points: number[]): MapObject {
    return {
      id: crypto.randomUUID(),
      type,
      points,
      label: type === 'label' ? t('maps.newLabel') : '',
      number: '',
      icon: 'pin',
      color:
        type === 'zone'
          ? '#1c7ed6'
          : type === 'rope'
            ? '#c92a2a'
            : type === 'path'
              ? '#8d5524'
              : '#d9480f',
      place_id: null,
      sign_id: null,
      item_ids: [],
      clue_ids: [],
    };
  }

  function finishDrawing() {
    if (!drawing || !layer || !POLY.has(tool as MapObjectType)) return;
    const minimum = tool === 'zone' ? 6 : 4;
    if (drawing.length >= minimum) {
      const object = newObject(tool as MapObjectType, drawing);
      change([...objectsOf(layer), object]);
      setSelectedId(object.id);
    }
    setDrawing(null);
  }

  function onStageClick(event: Konva.KonvaEventObject<MouseEvent>) {
    if (!canEdit || !layer) {
      if (event.target === event.target.getStage()) setSelectedId(null);
      return;
    }
    const stage = stageRef.current;
    const point = stage?.getRelativePointerPosition();
    if (!point) return;
    const x = Math.round(point.x);
    const y = Math.round(point.y);
    if (tool === 'select') {
      if (event.target === stage || event.target.name() === 'background') setSelectedId(null);
      return;
    }
    if (POLY.has(tool)) {
      setDrawing((current) => [...(current ?? []), x, y]);
      return;
    }
    const object = newObject(tool, [x, y]);
    change([...objectsOf(layer), object]);
    setSelectedId(object.id);
    setTool('select');
  }

  function onWheel(event: Konva.KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return;
    const factor = event.evt.deltaY > 0 ? 0.9 : 1.1;
    const scale = Math.min(4, Math.max(0.1, view.scale * factor));
    const mouse = { x: (pointer.x - view.x) / view.scale, y: (pointer.y - view.y) / view.scale };
    setView({ scale, x: pointer.x - mouse.x * scale, y: pointer.y - mouse.y * scale });
  }

  /** The whole map at full size as PNG bytes (view reset while drawing). */
  function snapshot(pixelRatio: number): Uint8Array {
    const stage = stageRef.current;
    if (!stage) throw new Error('no map');
    const before = {
      scale: stage.scaleX(),
      x: stage.x(),
      y: stage.y(),
      width: stage.width(),
      height: stage.height(),
    };
    stage.scale({ x: 1, y: 1 });
    stage.position({ x: 0, y: 0 });
    stage.size({ width: data.width, height: data.height });
    stage.draw();
    const url = stage.toDataURL({ x: 0, y: 0, width: data.width, height: data.height, pixelRatio });
    stage.scale({ x: before.scale, y: before.scale });
    stage.position({ x: before.x, y: before.y });
    stage.size({ width: before.width, height: before.height });
    stage.draw();
    const binary = atob(url.slice(url.indexOf(',') + 1));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  async function exportMap(kind: 'png' | 'A4' | 'A3') {
    await run(async () => {
      const png = snapshot(2);
      if (kind === 'png') {
        await window.zazemi.dialogs.saveFile({
          defaultName: `${map.title}.png`.replace(/[<>:"/\\|?*]/g, ' '),
          filters: [{ name: 'PNG', extensions: ['png'] }],
          data: png,
        });
        return;
      }
      const pdf = await PDFDocument.create();
      const size: [number, number] = kind === 'A4' ? [841.89, 595.28] : [1190.55, 841.89];
      const landscape = data.width >= data.height;
      const page = pdf.addPage(landscape ? size : [size[1], size[0]]);
      const image = await pdf.embedPng(png);
      const margin = 28;
      const { width, height } = page.getSize();
      const scale = Math.min(
        (width - 2 * margin) / image.width,
        (height - 2 * margin) / image.height,
      );
      page.drawImage(image, {
        x: (width - image.width * scale) / 2,
        y: (height - image.height * scale) / 2,
        width: image.width * scale,
        height: image.height * scale,
      });
      // Page furniture in a standard font: only ASCII-safe text.
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      page.drawText(kind, { x: margin, y: 12, size: 7, font });
      await save(await pdf.save(), map.title, 'pdf');
    });
  }

  const meters = data.scale_meters;
  const stageWidth = Math.max(320, Math.floor(canvasWidth) || 800);
  const stageHeight = 620;
  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Group gap="xs">
          <Title order={3}>{map.title}</Title>
          <Badge variant="light">{t(`maps.types.${data.type}`)}</Badge>
          {dirty && (
            <Badge color="orange" variant="light">
              {t('maps.unsaved')}
            </Badge>
          )}
        </Group>
        <Group gap="xs">
          <Menu>
            <Menu.Target>
              <Button variant="default" leftSection={<IconDownload size={14} />}>
                {t('print.export')}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => void exportMap('png')}>PNG</Menu.Item>
              <Menu.Item onClick={() => void exportMap('A4')}>PDF A4</Menu.Item>
              <Menu.Item onClick={() => void exportMap('A3')}>PDF A3</Menu.Item>
            </Menu.Dropdown>
          </Menu>
          {canEdit && (
            <>
              <ActionIcon
                variant="default"
                size="lg"
                aria-label={t('maps.settings')}
                onClick={() => setSettings(true)}
              >
                <IconSettings size={16} />
              </ActionIcon>
              <Button disabled={!dirty} onClick={() => void saveAll()}>
                {t('common.save')}
              </Button>
            </>
          )}
        </Group>
      </Group>
      {canEdit && (
        <SegmentedControl
          size="xs"
          value={tool}
          onChange={(value) => {
            setTool(value);
            setDrawing(null);
          }}
          data={[
            { value: 'select', label: t('maps.tools.select') },
            ...mapObjectTypes.map((value) => ({ value, label: t(`maps.tools.${value}`) })),
          ]}
          data-testid="map-tools"
        />
      )}
      {drawing && (
        <Text size="xs" c="dimmed">
          {t('maps.drawingHint')}
        </Text>
      )}
      <Grid gap="sm">
        <Grid.Col span={{ base: 12, lg: 9 }}>
          <Paper ref={canvasRef} withBorder style={{ overflow: 'hidden' }} data-testid="map-canvas">
            <Stage
              ref={stageRef}
              width={stageWidth}
              height={stageHeight}
              scaleX={view.scale}
              scaleY={view.scale}
              x={view.x}
              y={view.y}
              draggable={tool === 'select'}
              onDragEnd={(event) => {
                if (event.target === stageRef.current)
                  setView((current) => ({ ...current, x: event.target.x(), y: event.target.y() }));
              }}
              onClick={onStageClick}
              onDblClick={finishDrawing}
              onWheel={onWheel}
            >
              <Layer>
                <Rect
                  name="background"
                  x={0}
                  y={0}
                  width={data.width}
                  height={data.height}
                  fill="#f8f4e8"
                  stroke="#999"
                  strokeWidth={1}
                />
                {background && (
                  <KImage
                    name="background"
                    image={background}
                    x={0}
                    y={0}
                    width={data.width}
                    height={data.height}
                  />
                )}
              </Layer>
              {layerRows
                .filter((row) => !hidden.includes(row.id))
                .map((row) => (
                  <Layer key={row.id}>
                    {objectsOf(row).map((object) => (
                      <MapShape
                        key={object.id}
                        object={object}
                        selected={object.id === selectedId}
                        draggable={canEdit && tool === 'select' && row.id === layer?.id}
                        onSelect={() => {
                          if (tool !== 'select') return;
                          setActiveLayer(row.id);
                          setSelectedId(object.id);
                        }}
                        onMove={(dx, dy) => {
                          setEdits((current) => ({
                            ...current,
                            [row.id]: objectsOf(row).map((item) =>
                              item.id === object.id
                                ? {
                                    ...item,
                                    points: item.points.map((value, index) =>
                                      Math.round(value + (index % 2 === 0 ? dx : dy)),
                                    ),
                                  }
                                : item,
                            ),
                          }));
                        }}
                      />
                    ))}
                  </Layer>
                ))}
              <Layer listening={false}>
                {drawing && (
                  <Line
                    points={drawing}
                    stroke="#228be6"
                    strokeWidth={2}
                    dash={[6, 4]}
                    closed={tool === 'zone'}
                  />
                )}
                {data.show_scale && (
                  <KGroup x={20} y={data.height - 40}>
                    <Rect width={data.scale_pixels} height={6} fill="#222" />
                    <KText y={10} text={`${String(meters)} m`} fontSize={14} fill="#222" />
                  </KGroup>
                )}
                {data.show_compass && (
                  <KGroup x={data.width - 50} y={50}>
                    <Line points={[0, 25, 0, -25]} stroke="#222" strokeWidth={2} />
                    <Line
                      points={[-8, -12, 0, -28, 8, -12]}
                      stroke="#222"
                      strokeWidth={2}
                      closed
                      fill="#222"
                    />
                    {/* S = sever (north), J = jih (south) */}
                    <KText x={-6} y={-46} text="S" fontSize={14} fontStyle="bold" fill="#222" />
                    <KText x={-6} y={28} text="J" fontSize={14} fontStyle="bold" fill="#222" />
                  </KGroup>
                )}
              </Layer>
            </Stage>
          </Paper>
          <Text size="xs" c="dimmed" mt={4}>
            {t('maps.navigationHint')}
          </Text>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 3 }}>
          <Stack gap="sm">
            <Paper withBorder p="sm">
              <Group justify="space-between" mb={4}>
                <Text fw={600} size="sm">
                  {t('maps.layers')}
                </Text>
                {canEdit && (
                  <ActionIcon
                    size="sm"
                    variant="light"
                    aria-label={t('maps.newLayer')}
                    onClick={() =>
                      void run(async () => {
                        const row = await repo.createRecord({
                          kind: 'map_layer',
                          title: t('maps.newLayerName', { count: layerRows.length + 1 }),
                          game_id: map.game_id,
                          world_id: map.game_id ? null : map.world_id,
                          parent_id: map.id,
                          data: { order: layerRows.length },
                        });
                        setActiveLayer(row.id);
                      })
                    }
                  >
                    <IconPlus size={14} />
                  </ActionIcon>
                )}
              </Group>
              {layerRows.map((row) => (
                <Group
                  key={row.id}
                  gap={4}
                  wrap="nowrap"
                  justify="space-between"
                  data-testid="map-layer"
                >
                  <NavLink
                    label={row.title}
                    active={row.id === layer?.id}
                    onClick={() => setActiveLayer(row.id)}
                    py={2}
                    leftSection={row.visibility === 'organizers' ? <IconLock size={12} /> : null}
                  />
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    aria-label={t('maps.toggleLayer')}
                    onClick={() =>
                      setHidden((current) =>
                        current.includes(row.id)
                          ? current.filter((item) => item !== row.id)
                          : [...current, row.id],
                      )
                    }
                  >
                    {hidden.includes(row.id) ? <IconEyeOff size={14} /> : <IconEye size={14} />}
                  </ActionIcon>
                  {isOrganizer && (
                    <Tooltip label={t('maps.layerVisibility')}>
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        aria-label={t('maps.layerVisibility')}
                        onClick={() => setLayerVisibility(row.id)}
                      >
                        <IconSettings size={14} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              ))}
            </Paper>
            {selected && layer && (
              <ObjectPanel
                key={selected.id}
                game={game}
                object={selected}
                editable={canEdit}
                onChange={(patch) => update(selected.id, patch)}
                onDelete={() => {
                  change(objectsOf(layer).filter((object) => object.id !== selected.id));
                  setSelectedId(null);
                }}
              />
            )}
          </Stack>
        </Grid.Col>
      </Grid>
      {settings && <MapSettings map={map} onClose={() => setSettings(false)} />}
      {layerVisibility && (
        <Modal opened onClose={() => setLayerVisibility(null)} title={t('maps.layerVisibility')}>
          {/* The live row, so the editor sees its own save. */}
          {(() => {
            const row = layerRows.find((item) => item.id === layerVisibility);
            return row ? <VisibilityEditor key={`${row.id}:${row.rev}`} record={row} /> : null;
          })()}
        </Modal>
      )}
    </Stack>
  );
}

function MapShape({
  object,
  selected,
  draggable,
  onSelect,
  onMove,
}: {
  object: MapObject;
  selected: boolean;
  draggable: boolean;
  onSelect: () => void;
  onMove: (dx: number, dy: number) => void;
}) {
  const [x = 0, y = 0] = object.points;
  const highlight = selected ? { shadowColor: '#228be6', shadowBlur: 12, shadowOpacity: 1 } : {};
  const common = {
    draggable,
    onClick: (event: Konva.KonvaEventObject<MouseEvent>) => {
      event.cancelBubble = true;
      onSelect();
    },
    onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => {
      const node = event.target;
      const dx = node.x() - (POLY.has(object.type) ? 0 : x);
      const dy = node.y() - (POLY.has(object.type) ? 0 : y);
      if (POLY.has(object.type)) node.position({ x: 0, y: 0 });
      onMove(dx, dy);
    },
  };
  switch (object.type) {
    case 'zone':
      return (
        <KGroup {...common}>
          <Line
            points={object.points}
            closed
            fill={`${object.color}33`}
            stroke={object.color}
            strokeWidth={2}
            {...highlight}
          />
          {object.label && (
            <KText
              x={x}
              y={y - 18}
              text={object.label}
              fontSize={16}
              fill={object.color}
              fontStyle="bold"
            />
          )}
        </KGroup>
      );
    case 'path':
    case 'rope':
      return (
        <KGroup {...common}>
          <Line
            points={object.points}
            stroke={object.color}
            strokeWidth={object.type === 'path' ? 5 : 2}
            dash={object.type === 'rope' ? [10, 6] : []}
            lineCap="round"
            lineJoin="round"
            hitStrokeWidth={14}
            {...highlight}
          />
          {object.label && (
            <KText x={x + 6} y={y + 6} text={object.label} fontSize={13} fill={object.color} />
          )}
        </KGroup>
      );
    case 'gate':
      return (
        <KGroup x={x} y={y} {...common}>
          <Rect x={-14} y={-5} width={28} height={10} fill={object.color} {...highlight} />
          {object.label && (
            <KText
              x={-30}
              y={8}
              width={60}
              align="center"
              text={object.label}
              fontSize={12}
              fill="#222"
            />
          )}
        </KGroup>
      );
    case 'building':
      return (
        <KGroup x={x} y={y} {...common}>
          <Rect
            x={-16}
            y={-16}
            width={32}
            height={32}
            fill="#fff"
            stroke={object.color}
            strokeWidth={2}
            {...highlight}
          />
          <KText
            x={-16}
            y={-8}
            width={32}
            align="center"
            text={object.number}
            fontSize={14}
            fontStyle="bold"
            fill="#222"
          />
          {object.label && (
            <KText
              x={-40}
              y={20}
              width={80}
              align="center"
              text={object.label}
              fontSize={12}
              fill="#222"
            />
          )}
        </KGroup>
      );
    case 'label':
      return (
        <KGroup x={x} y={y} {...common}>
          <KText
            text={object.label}
            fontSize={20}
            fontStyle="bold italic"
            fill={object.color}
            {...highlight}
          />
        </KGroup>
      );
    case 'marker':
      return (
        <KGroup x={x} y={y} {...common}>
          <Circle radius={11} fill={object.color} stroke="#fff" strokeWidth={2} {...highlight} />
          <KText
            x={-11}
            y={-7}
            width={22}
            align="center"
            text={ICON_GLYPH[object.icon]}
            fontSize={13}
            fontStyle="bold"
            fill="#fff"
          />
          {object.label && (
            <KText
              x={-50}
              y={14}
              width={100}
              align="center"
              text={object.label}
              fontSize={12}
              fill="#222"
            />
          )}
        </KGroup>
      );
  }
}

function ObjectPanel({
  game,
  object,
  editable,
  onChange,
  onDelete,
}: {
  game: RecordRow;
  object: MapObject;
  editable: boolean;
  onChange: (patch: Partial<MapObject>) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const places = useLinkTargets().filter((target) => target.kind === 'page');
  const signs = useGameRecords('location_sign', game.id) ?? NONE;
  const items = useGameRecords('item', game.id) ?? NONE;
  const clues = useGameRecords('clue', game.id) ?? NONE;
  return (
    <Paper withBorder p="sm" data-testid="map-object">
      <Stack gap="xs">
        <Group justify="space-between">
          <Text fw={600} size="sm">
            {t(`maps.tools.${object.type}`)}
          </Text>
          {editable && (
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              aria-label={t('common.delete')}
              onClick={onDelete}
            >
              <IconTrash size={14} />
            </ActionIcon>
          )}
        </Group>
        <TextInput
          size="xs"
          label={t('maps.label')}
          value={object.label}
          onChange={(event) => onChange({ label: event.currentTarget.value })}
          readOnly={!editable}
        />
        {object.type === 'building' && (
          <TextInput
            size="xs"
            label={t('maps.number')}
            value={object.number}
            onChange={(event) => onChange({ number: event.currentTarget.value })}
            readOnly={!editable}
          />
        )}
        {object.type === 'marker' && (
          <Select
            size="xs"
            label={t('maps.icon')}
            data={markerIcons.map((value) => ({
              value,
              label: `${ICON_GLYPH[value]} ${t(`maps.icons.${value}`)}`,
            }))}
            value={object.icon}
            onChange={(value) => value && onChange({ icon: value })}
            allowDeselect={false}
            disabled={!editable}
          />
        )}
        <ColorInput
          size="xs"
          label={t('maps.color')}
          value={object.color}
          onChange={(value) => /^#[0-9a-f]{6}$/i.test(value) && onChange({ color: value })}
          disabled={!editable}
        />
        <Select
          size="xs"
          label={t('maps.place')}
          data={places.map((place) => ({ value: place.id, label: place.title }))}
          value={object.place_id}
          onChange={(value) => onChange({ place_id: value })}
          searchable
          clearable
          disabled={!editable}
        />
        <Select
          size="xs"
          label={t('maps.sign')}
          data={signs.map((row) => ({ value: row.id, label: row.title }))}
          value={object.sign_id}
          onChange={(value) => onChange({ sign_id: value })}
          clearable
          disabled={!editable}
        />
        <MultiSelect
          size="xs"
          label={t('maps.items')}
          data={items.map((row) => ({ value: row.id, label: row.title }))}
          value={object.item_ids}
          onChange={(value) => onChange({ item_ids: value })}
          searchable
          disabled={!editable}
        />
        <MultiSelect
          size="xs"
          label={t('maps.clues')}
          data={clues.map((row) => ({ value: row.id, label: row.title }))}
          value={object.clue_ids}
          onChange={(value) => onChange({ clue_ids: value })}
          searchable
          disabled={!editable}
        />
      </Stack>
    </Paper>
  );
}

function MapSettings({ map, onClose }: { map: RecordRow; onClose: () => void }) {
  const { t } = useTranslation();
  const { repo } = useTeam();
  const run = useRun();
  const images =
    useTeamRecords(
      (row) => row.kind === 'file' && readData(fileKind, row).mime.startsWith('image/'),
      'images',
    ) ?? NONE;
  const [title, setTitle] = useState(map.title);
  const [fields, setFields] = useState(readData(mapKind, map));
  const set = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) =>
    setFields((current) => ({ ...current, [key]: value }));
  const size = (key: 'width' | 'height' | 'scale_pixels' | 'scale_meters', label: string) => (
    <NumberInput
      label={label}
      value={fields[key]}
      min={1}
      onChange={(value) => set(key, Math.max(1, Math.round(Number(value) || 1)))}
    />
  );
  return (
    <Modal opened onClose={onClose} title={t('maps.settings')}>
      <Stack>
        <TextInput
          label={t('common.name')}
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
        />
        <Select
          label={t('maps.background')}
          description={t('maps.backgroundHint')}
          data={images.map((row) => ({ value: row.id, label: row.title }))}
          value={fields.background_file_id}
          onChange={(value) => set('background_file_id', value)}
          searchable
          clearable
        />
        <Group grow>
          {size('width', t('maps.width'))}
          {size('height', t('maps.height'))}
        </Group>
        <Group grow>
          {size('scale_pixels', t('maps.scalePixels'))}
          {size('scale_meters', t('maps.scaleMeters'))}
        </Group>
        <Switch
          label={t('maps.showScale')}
          checked={fields.show_scale}
          onChange={(event) => set('show_scale', event.currentTarget.checked)}
        />
        <Switch
          label={t('maps.showCompass')}
          checked={fields.show_compass}
          onChange={(event) => set('show_compass', event.currentTarget.checked)}
        />
        <VisibilityEditor record={map} />
        <Group justify="space-between">
          <Button
            variant="subtle"
            color="red"
            leftSection={<IconTrash size={14} />}
            onClick={() => void run(() => repo.trashRecord(map)).then((ok) => ok && onClose())}
          >
            {t('worlds.trash')}
          </Button>
          <Group>
            <Button variant="default" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() =>
                void run(() =>
                  repo.updateRecord(map.id, map.rev, {
                    title: title.trim() || map.title,
                    data: { ...map.data, ...fields },
                  }),
                ).then((ok) => ok && onClose())
              }
            >
              {t('common.save')}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
