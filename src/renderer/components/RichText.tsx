import { ActionIcon, Badge, Group, Paper, Stack, Text, Tooltip, Typography } from '@mantine/core';
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBlockquote,
  IconBold,
  IconH2,
  IconH3,
  IconItalic,
  IconList,
  IconListNumbers,
} from '@tabler/icons-react';
import { Mention, type MentionNodeAttrs } from '@tiptap/extension-mention';
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  useEditorState,
  type Editor,
  type NodeViewProps,
} from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { RecordRow } from '@core/model';
import { WIKI_LINK, type RichDoc } from '@core/richtext';
import { compareCzech, fold, matchesQuery } from '@core/text';
import { recordLink } from '../app/links';
import { useTeamRecords } from '../data/hooks';

/** Records a `[[link]]` can point to. */
export const LINKABLE_KINDS = new Set([
  'world',
  'game',
  'page',
  'character',
  'npc',
  'faction',
  'definition',
  'plot_thread',
  'quest',
  'rule_section',
  'glossary_term',
  'history_event',
  'prop_document',
]);

export interface LinkTarget {
  id: string;
  title: string;
  kind: string;
  path: string;
}

const TargetsContext = createContext<Map<string, LinkTarget>>(new Map());

/** Every record the current person can link to (and read). */
export function useLinkTargets(): LinkTarget[] {
  const rows = useTeamRecords((row) => LINKABLE_KINDS.has(row.kind), 'linkable');
  return useMemo(
    () =>
      (rows ?? []).map((row: RecordRow) => ({
        id: row.id,
        title: row.title,
        kind: row.kind,
        path: recordLink(row),
      })),
    [rows],
  );
}

/** A `[[link]]` shows the target's current title; a missing target is struck through. */
function WikiLinkView({ node, editor }: NodeViewProps) {
  const targets = useContext(TargetsContext);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const id = String(node.attrs['id'] ?? '');
  const target = targets.get(id);
  const label = target?.title ?? String(node.attrs['label'] ?? '?');
  return (
    <NodeViewWrapper
      as="span"
      className={target ? 'wikilink' : 'wikilink wikilink-missing'}
      data-wikilink={id}
      title={
        target ? (editor.isEditable ? t('richText.ctrlClick') : undefined) : t('richText.missing')
      }
      onClick={(event: React.MouseEvent) => {
        if (!target) return;
        if (editor.isEditable && !(event.ctrlKey || event.metaKey)) return;
        event.preventDefault();
        void navigate(target.path);
      }}
    >
      {label}
    </NodeViewWrapper>
  );
}

interface Popup {
  items: LinkTarget[];
  index: number;
  rect: DOMRect | null;
  command: ((attrs: MentionNodeAttrs) => void) | null;
}

const CLOSED: Popup = { items: [], index: 0, rect: null, command: null };

export interface RichTextProps {
  value: RichDoc;
  onChange?: (value: RichDoc) => void;
  editable: boolean;
  placeholder?: string;
  minHeight?: number;
  /** The record being edited, left out of the link suggestions. */
  selfId?: string;
  'data-testid'?: string;
}

/** Titles that start with the query first, then other word matches. */
export function suggest(targets: LinkTarget[], query: string): LinkTarget[] {
  const q = fold(query.trim());
  return targets
    .filter((target) => matchesQuery(target.title, query))
    .map((target) => ({ target, starts: fold(target.title).startsWith(q) ? 0 : 1 }))
    .sort((a, b) => a.starts - b.starts || compareCzech(a.target.title, b.target.title))
    .slice(0, 8)
    .map(({ target }) => target);
}

/**
 * The rich-text editor (TipTap, free core only). "[[" opens a list of records
 * to link; links keep pointing at the record when it is renamed.
 */
export function RichText({
  value,
  onChange,
  editable,
  minHeight = 120,
  selfId,
  ...rest
}: RichTextProps) {
  const { t } = useTranslation();
  const allTargets = useLinkTargets();
  const targets = useMemo(
    () => allTargets.filter((target) => target.id !== selfId),
    [allTargets, selfId],
  );
  const byId = useMemo(
    () => new Map(allTargets.map((target) => [target.id, target])),
    [allTargets],
  );
  const targetsRef = useRef(targets);
  const onChangeRef = useRef(onChange);
  const [popup, setPopup] = useState<Popup>(CLOSED);
  const popupRef = useRef(popup);
  useEffect(() => {
    targetsRef.current = targets;
    onChangeRef.current = onChange;
    popupRef.current = popup;
  });

  const editor = useEditor({
    editable,
    content: value,
    extensions: [
      StarterKit.configure({ link: false, heading: { levels: [2, 3] } }),
      Mention.extend({
        name: WIKI_LINK,
        addNodeView() {
          return ReactNodeViewRenderer(WikiLinkView, { as: 'span' });
        },
        // The refs are read only inside TipTap's callbacks (typing, keys,
        // updates), never while rendering.
        // eslint-disable-next-line react-hooks/refs
      }).configure({
        renderText: ({ node }) => String(node.attrs['label'] ?? ''),
        suggestion: {
          char: '[[',
          allowSpaces: true,
          items: ({ query }: { query: string }) => suggest(targetsRef.current, query),
          render: () => {
            const show = (props: SuggestionProps<LinkTarget, MentionNodeAttrs>) => {
              setPopup({
                items: props.items,
                index: 0,
                rect: props.clientRect?.() ?? null,
                command: props.command,
              });
            };
            return {
              onStart: show,
              onUpdate: show,
              onKeyDown: ({ event }: SuggestionKeyDownProps) => {
                const current = popupRef.current;
                if (event.key === 'Escape') {
                  setPopup(CLOSED);
                  return true;
                }
                if (current.items.length === 0) return false;
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  const step = event.key === 'ArrowDown' ? 1 : -1;
                  const index =
                    (current.index + step + current.items.length) % current.items.length;
                  setPopup({ ...current, index });
                  return true;
                }
                if (event.key === 'Enter' || event.key === 'Tab') {
                  const item = current.items[current.index];
                  if (item) current.command?.({ id: item.id, label: item.title });
                  return true;
                }
                return false;
              },
              onExit: () => setPopup(CLOSED),
            };
          },
        },
      }),
    ],
    onUpdate: ({ editor: instance }) => {
      onChangeRef.current?.(instance.getJSON() as RichDoc);
    },
  });

  useEffect(() => {
    editor.setEditable(editable);
  }, [editor, editable]);

  return (
    <TargetsContext.Provider value={byId}>
      <Stack gap={4} data-testid={rest['data-testid']}>
        {editable && <Toolbar editor={editor} />}
        <Paper
          withBorder={editable}
          p={editable ? 'xs' : 0}
          className="richtext"
          style={{ minHeight: editable ? minHeight : undefined }}
        >
          <Typography>
            <EditorContent editor={editor} aria-label={rest.placeholder} />
          </Typography>
        </Paper>
        {editable && (
          <Text size="xs" c="dimmed">
            {t('richText.hint')}
          </Text>
        )}
      </Stack>
      {popup.rect && (
        <Paper
          shadow="md"
          withBorder
          p={4}
          pos="fixed"
          top={popup.rect.bottom + 4}
          left={popup.rect.left}
          style={{ zIndex: 400, minWidth: 260 }}
          data-testid="link-suggestions"
        >
          {popup.items.length === 0 ? (
            <Text size="sm" c="dimmed" p={4}>
              {t('richText.noMatch')}
            </Text>
          ) : (
            popup.items.map((item, index) => (
              <Group
                key={item.id}
                justify="space-between"
                gap="xs"
                p={4}
                role="option"
                aria-selected={index === popup.index}
                style={{
                  cursor: 'pointer',
                  borderRadius: 4,
                  background:
                    index === popup.index ? 'var(--mantine-primary-color-light)' : undefined,
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                  popup.command?.({ id: item.id, label: item.title });
                }}
              >
                <Text size="sm">{item.title}</Text>
                <Badge size="xs" variant="light" color="gray">
                  {t(`kinds.${item.kind}`, { defaultValue: item.kind })}
                </Badge>
              </Group>
            ))
          )}
        </Paper>
      )}
    </TargetsContext.Provider>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();
  const buttons = [
    {
      key: 'bold',
      icon: <IconBold size={16} />,
      active: state.bold,
      run: () => chain().toggleBold().run(),
    },
    {
      key: 'italic',
      icon: <IconItalic size={16} />,
      active: state.italic,
      run: () => chain().toggleItalic().run(),
    },
    {
      key: 'h2',
      icon: <IconH2 size={16} />,
      active: state.h2,
      run: () => chain().toggleHeading({ level: 2 }).run(),
    },
    {
      key: 'h3',
      icon: <IconH3 size={16} />,
      active: state.h3,
      run: () => chain().toggleHeading({ level: 3 }).run(),
    },
    {
      key: 'bullet',
      icon: <IconList size={16} />,
      active: state.bullet,
      run: () => chain().toggleBulletList().run(),
    },
    {
      key: 'ordered',
      icon: <IconListNumbers size={16} />,
      active: state.ordered,
      run: () => chain().toggleOrderedList().run(),
    },
    {
      key: 'quote',
      icon: <IconBlockquote size={16} />,
      active: state.quote,
      run: () => chain().toggleBlockquote().run(),
    },
  ] as const;
  return (
    <Group gap={2}>
      {buttons.map((button) => (
        <Tooltip key={button.key} label={t(`richText.${button.key}`)}>
          <ActionIcon
            variant={button.active ? 'filled' : 'subtle'}
            size="sm"
            aria-label={t(`richText.${button.key}`)}
            onClick={button.run}
          >
            {button.icon}
          </ActionIcon>
        </Tooltip>
      ))}
      <Tooltip label={t('richText.undo')}>
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label={t('richText.undo')}
          disabled={!state.canUndo}
          onClick={() => chain().undo().run()}
        >
          <IconArrowBackUp size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={t('richText.redo')}>
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label={t('richText.redo')}
          disabled={!state.canRedo}
          onClick={() => chain().redo().run()}
        >
          <IconArrowForwardUp size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
