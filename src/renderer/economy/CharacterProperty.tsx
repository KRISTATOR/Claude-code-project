import { Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { computeHoldings } from '@core/economy/ledger';
import { itemKind, readData } from '@core/kinds';
import type { RecordRow } from '@core/model';
import { NONE, useGameRecords } from '../data/hooks';

/** The sheet's "Majetek" section: what the character holds now (catalogue + ledger). */
export function CharacterProperty({ character }: { character: RecordRow }) {
  const { t } = useTranslation();
  const items = useGameRecords('item', character.game_id) ?? NONE;
  const transfers = useGameRecords('transfer', character.game_id) ?? NONE;
  const { holdings } = computeHoldings(items, transfers);
  const mine = [...(holdings.get(character.id) ?? new Map<string, number>())].filter(
    ([, quantity]) => quantity > 0,
  );
  if (mine.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {t('items.nothingHeld')}
      </Text>
    );
  }
  return (
    <Stack gap={2} data-testid="property">
      {mine.map(([itemId, quantity]) => {
        const item = items.find((row) => row.id === itemId);
        const effect = item ? readData(itemKind, item).effect : '';
        return (
          <Text key={itemId} size="sm">
            {quantity}× <b>{item?.title ?? '?'}</b>
            {effect ? ` – ${effect}` : ''}
          </Text>
        );
      })}
    </Stack>
  );
}
