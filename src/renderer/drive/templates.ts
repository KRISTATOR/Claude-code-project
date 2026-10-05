import { extensionOf } from '@core/files/names';

export type TemplateValues = Record<'tym' | 'svet' | 'hra' | 'datum' | 'slozka', string>;

/**
 * Fills {tym}, {svet}, {hra}, {datum}, {slozka} in Word and Excel templates.
 * Other file types are copied as they are. Unknown tags are left empty.
 */
export async function fillTemplate(
  name: string,
  data: Uint8Array,
  values: TemplateValues,
): Promise<Uint8Array> {
  const ext = extensionOf(name);
  if (ext === 'docx' || ext === 'dotx') {
    const [{ default: PizZip }, { default: Docxtemplater }] = await Promise.all([
      import('pizzip'),
      import('docxtemplater'),
    ]);
    const zip = new PizZip(data);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => '',
    });
    doc.render(values);
    return doc.getZip().generate({ type: 'uint8array', compression: 'DEFLATE' });
  }
  if (ext === 'xlsx' || ext === 'xltx') {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(data.slice().buffer);
    workbook.eachSheet((sheet) => {
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          if (typeof cell.value === 'string') {
            cell.value = cell.value.replace(
              /\{(tym|svet|hra|datum|slozka)\}/g,
              (_match, key: keyof TemplateValues) => values[key],
            );
          }
        });
      });
    });
    return new Uint8Array(await workbook.xlsx.writeBuffer());
  }
  return data;
}
