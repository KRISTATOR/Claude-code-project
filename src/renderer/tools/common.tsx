import { Alert, Badge, Select, Textarea, TextInput, type TextareaProps } from '@mantine/core';
import { modals } from '@mantine/modals';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { RecordRow } from '@core/model';
import { useTeam } from '../app/workspace';
import { errorMessage } from '../components/errors';
import { notifyError, notifySuccess } from '../components/notify';
import { useCurrentGame } from '../data/hooks';

/** Runs a write and reports failures in Czech. */
export function useRun() {
  const { t } = useTranslation();
  return async (action: () => Promise<unknown>, success?: string): Promise<boolean> => {
    try {
      await action();
      if (success) notifySuccess(success);
      return true;
    } catch (error) {
      notifyError(errorMessage(t, error));
      return false;
    }
  };
}

/** Pages that work on one game render only when there is one. */
export function GameGate({ children }: { children: (game: RecordRow) => ReactNode }) {
  const { t } = useTranslation();
  const { game } = useCurrentGame();
  if (!game) {
    return (
      <Alert color="gray" variant="light">
        {t('game.none')}
      </Alert>
    );
  }
  return <>{children(game)}</>;
}

/** The game picker shown in the navigation. */
export function GameSwitcher() {
  const { t } = useTranslation();
  const { game, games, setGameId } = useCurrentGame();
  if (games.length === 0) return null;
  return (
    <Select
      size="xs"
      label={t('nav.gameSection')}
      data={games.map((row) => ({ value: row.id, label: row.title }))}
      value={game?.id ?? null}
      onChange={(value) => value && setGameId(value)}
      allowDeselect={false}
      data-testid="game-switcher"
    />
  );
}

/** A multi-line field that is read-only for people who cannot edit. */
export function Field(props: TextareaProps & { value: string; onValue: (value: string) => void }) {
  const { canEdit } = useTeam();
  const { onValue, ...rest } = props;
  return (
    <Textarea
      autosize
      minRows={2}
      readOnly={!canEdit}
      variant={canEdit ? 'default' : 'filled'}
      {...rest}
      onChange={(event) => onValue(event.currentTarget.value)}
    />
  );
}

export function StatusBadge({ color, children }: { color: string; children: ReactNode }) {
  return (
    <Badge size="sm" variant="light" color={color}>
      {children}
    </Badge>
  );
}

/** Asks for a name in a small dialog; calls `onName` with the trimmed name. */
export function askName(options: {
  title: string;
  label: string;
  placeholder?: string;
  confirm: string;
  cancel: string;
  onName: (name: string) => void;
}) {
  let name = '';
  modals.openConfirmModal({
    title: options.title,
    children: (
      <TextInput
        data-autofocus
        label={options.label}
        placeholder={options.placeholder}
        onChange={(event) => {
          name = event.currentTarget.value;
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && name.trim()) {
            modals.closeAll();
            options.onName(name.trim());
          }
        }}
      />
    ),
    labels: { confirm: options.confirm, cancel: options.cancel },
    onConfirm: () => {
      if (name.trim()) options.onName(name.trim());
    },
  });
}

/** Asks for a name with the usual Czech labels. */
export function useAskName() {
  const { t } = useTranslation();
  return (title: string, onName: (name: string) => void, placeholder?: string) =>
    askName({
      title,
      label: t('common.name'),
      ...(placeholder ? { placeholder } : {}),
      confirm: t('common.create'),
      cancel: t('common.cancel'),
      onName,
    });
}

/** Records of a kind in the current game or, when not tied to a game, its world. */
export function inScope(row: RecordRow, game: RecordRow): boolean {
  return row.game_id === game.id || (row.game_id === null && row.world_id === game.world_id);
}
