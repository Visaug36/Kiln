import type { ConversionResult } from '../types';
import { changed, fail, interop, outputFile, readText } from '../shared';
import type { Warning } from '../types';
import { jsonToSheets } from './_json';

export async function convert(input: File): Promise<ConversionResult> {
  const sheets = jsonToSheets(await readText(input));
  if (sheets.every((sheet) => sheet.rows.length === 0)) {
    fail('There were no rows in this JSON file to put in a spreadsheet.');
  }

  const XLSX = interop(await import('@e965/xlsx'));
  const book = XLSX.utils.book_new();

  const warnings: Warning[] = [];
  const nested = sheets.some((sheet) =>
    (sheet.rows[0] ?? []).some((name) => name.includes('.')),
  );
  if (nested) {
    // Every value survives; the nesting does not. That is `changed`.
    warnings.push(
      changed(
        'Nested values were flattened into columns with dotted names, such as `address.city`.',
      ),
    );
  }

  for (const sheet of sheets) {
    // Excel refuses a sheet name over 31 characters or containing []:*?/\\.
    const name = sheet.name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet1';
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(sheet.rows), name);
    sheet.rows.length = 0;
  }

  const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

  return {
    files: [outputFile(input.name, 'xlsx', new Uint8Array(bytes))],
    warnings: warnings.length ? warnings : undefined,
  };
}
