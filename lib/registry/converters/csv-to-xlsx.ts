import type { ConversionResult } from '../types';
import { interop, outputFile } from '../shared';
import { readCsv } from './_sheet';

export async function convert(input: File): Promise<ConversionResult> {
  const { rows, delimiter } = await readCsv(input);
  const XLSX = interop(await import('@e965/xlsx'));

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Sheet1');

  const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

  const warnings =
    delimiter === ','
      ? undefined
      : [
          `This file used ${describeDelimiter(delimiter)} between values, not commas. Kiln read it that way.`,
        ];

  return { files: [outputFile(input.name, 'xlsx', new Uint8Array(bytes))], warnings };
}

function describeDelimiter(delimiter: string): string {
  if (delimiter === ';') return 'semicolons';
  if (delimiter === '\t') return 'tabs';
  if (delimiter === '|') return 'pipes';
  return `"${delimiter}"`;
}
