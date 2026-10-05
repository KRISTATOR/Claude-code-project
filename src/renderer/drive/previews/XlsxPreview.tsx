import { ScrollArea, Table, Tabs, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PreviewError } from './FilePreview';

const MAX_ROWS = 500;
const MAX_COLUMNS = 40;

interface Sheet {
  name: string;
  rows: string[][];
  truncated: boolean;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toLocaleDateString('cs-CZ');
  if (typeof value === 'number') return value.toLocaleString('cs-CZ');
  if (typeof value === 'object') {
    const record = value as {
      result?: unknown;
      text?: unknown;
      richText?: { text: string }[] | undefined;
    };
    if (record.richText) return record.richText.map((part) => part.text).join('');
    if (record.text !== undefined) return cellText(record.text);
    if (record.result !== undefined) return cellText(record.result);
    return '';
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'PRAVDA' : 'NEPRAVDA';
  return '';
}

/** Excel workbook as tables, one tab per sheet (ExcelJS). */
export default function XlsxPreview({ data }: { data: Uint8Array }) {
  const { t } = useTranslation();
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const life = { cancelled: false };
    const cancelled = () => life.cancelled;
    void (async () => {
      try {
        const ExcelJS = (await import('exceljs')).default;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(data.slice().buffer);
        const result: Sheet[] = workbook.worksheets.map((sheet) => {
          const rows: string[][] = [];
          const width = Math.min(sheet.columnCount, MAX_COLUMNS);
          sheet.eachRow({ includeEmpty: true }, (row, number) => {
            if (number > MAX_ROWS) return;
            const cells: string[] = [];
            for (let column = 1; column <= width; column += 1)
              cells.push(cellText(row.getCell(column).value));
            rows.push(cells);
          });
          return { name: sheet.name, rows, truncated: sheet.rowCount > MAX_ROWS };
        });
        if (!cancelled()) setSheets(result);
      } catch {
        if (!cancelled()) setFailed(true);
      }
    })();
    return () => {
      life.cancelled = true;
    };
  }, [data]);

  if (failed) return <PreviewError />;
  if (!sheets) return null;
  return (
    <Tabs defaultValue={sheets[0]?.name ?? ''} keepMounted={false}>
      <Tabs.List>
        {sheets.map((sheet) => (
          <Tabs.Tab key={sheet.name} value={sheet.name}>
            {sheet.name}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {sheets.map((sheet) => (
        <Tabs.Panel key={sheet.name} value={sheet.name} pt="xs">
          <ScrollArea h="60vh">
            <Table striped withTableBorder withColumnBorders fz="xs">
              <Table.Tbody>
                {sheet.rows.map((row, index) => (
                  <Table.Tr key={index}>
                    {row.map((cell, column) => (
                      <Table.Td key={column} style={{ whiteSpace: 'nowrap' }}>
                        {cell}
                      </Table.Td>
                    ))}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
          {sheet.truncated && (
            <Text size="xs" c="dimmed">
              {t('drive.sheetRowsLimited', { count: MAX_ROWS })}
            </Text>
          )}
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}
