import { Alert, Badge, Select, Textarea, type TextareaProps } from '@mantine/core';
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
