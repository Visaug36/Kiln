import type { ConversionResult } from '../types';
import { interop, outputFile } from '../shared';
import { readWorkbook } from './_sheet';

export async function convert(input: File): Promise<ConversionResult> {
  const { sheets, warnings } = await readWorkbook(input);
  const XLSX = interop(await import('@e965/xlsx'));

  const book = XLSX.utils.book_new();
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
    // The sheet holds the values now; keeping the source rows alive alongside
    // them doubles the peak for a large workbook, and this is the one part of
    // it Recast controls.
    sheet.rows.length = 0;
  }

  const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

  return {
    files: [outputFile(input.name, 'xlsx', new Uint8Array(bytes))],
    warnings: warnings.length ? warnings : undefined,
  };
}
