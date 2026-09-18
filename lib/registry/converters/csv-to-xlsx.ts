import type { ConversionResult } from '../types';
import { interop, outputFile } from '../shared';
import { readCsv } from './_sheet';

export async function convert(input: File): Promise<ConversionResult> {
  const { rows, delimiter } = await readCsv(input);
  const XLSX = interop(await import('@e965/xlsx'));

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  // The sheet holds the values now. Dropping the source array keeps one copy
  // of a large spreadsheet alive instead of two while SheetJS writes, which is
  // the one part of this conversion's memory Recast controls — the rest is the
  // workbook XML the writer builds in full before it zips anything.
  rows.length = 0;

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Sheet1');

  const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

  const warnings =
    delimiter === ','
      ? undefined
      : [
          `This file used ${describeDelimiter(delimiter)} between values, not commas. Recast read it that way.`,
        ];

  return { files: [outputFile(input.name, 'xlsx', new Uint8Array(bytes))], warnings };
}

function describeDelimiter(delimiter: string): string {
  if (delimiter === ';') return 'semicolons';
  if (delimiter === '\t') return 'tabs';
  if (delimiter === '|') return 'pipes';
  return `"${delimiter}"`;
}
