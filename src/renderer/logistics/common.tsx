import { Badge, Group, TextInput, type TextInputProps } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { allergens, diets } from '@core/kinds';
import { parseNumber } from '@core/format';
import { csvTable, type CsvTable } from '@core/logistics/csv';

/** Allergen and diet codes as options for a MultiSelect. */
export function useAllergenOptions(withDiets = true) {
  const { t } = useTranslation();
  return [...allergens, ...(withDiets ? diets : [])].map((code) => ({
    value: code,
    label: t(`allergens.${code}`),
  }));
}

export function AllergenBadges({ codes, color = 'orange' }: { codes: string[]; color?: string }) {
  const { t } = useTranslation();
  if (codes.length === 0) return null;
  const known = new Set<string>([...allergens, ...diets]);
  return (
    <Group gap={4}>
      {codes
        .filter((code) => known.has(code))
        .map((code) => (
          <Badge key={code} size="xs" variant="light" color={color}>
            {t(`allergens.${code as (typeof allergens)[number]}`)}
          </Badge>
        ))}
    </Group>
  );
}

/** Reads a CSV the user picked. Google Forms writes UTF-8; Czech Excel may write Windows-1250. */
export async function readCsvFile(file: File): Promise<CsvTable> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder('windows-1250').decode(bytes);
  }
  return csvTable(text);
}

/**
 * A number field that accepts a decimal comma ("1,5"), as CLAUDE.md asks.
 * Uncontrolled text, so typing "1," doesn't jump back to "1".
 */
export function DecimalInput({
  value,
  onValue,
  nullable = false,
  ...props
}: Omit<TextInputProps, 'value' | 'onChange' | 'defaultValue'> & {
  value: number | null;
  onValue: (value: number | null) => void;
  nullable?: boolean;
}) {
  return (
    <TextInput
      inputMode="decimal"
      {...props}
      defaultValue={value === null ? '' : String(value).replace('.', ',')}
      onChange={(event) => {
        const parsed = parseNumber(event.currentTarget.value);
        onValue(parsed === null ? (nullable ? null : 0) : Math.max(0, parsed));
      }}
    />
  );
}
