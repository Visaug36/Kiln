import type { ConversionResult } from '../types';
import { interop, outputFile } from '../shared';
import { readWorkbook } from './_sheet';

/**
 * Written through SheetJS's own ODS writer rather than Recast's OpenDocument
 * one: a spreadsheet's content is cell values with types, which SheetJS already
 * knows how to spell, and `_odf.ts` builds documents and decks.
 */
export async function convert(input: File): Promise<ConversionResult> {
  const { sheets, warnings } = await readWorkbook(input);
  const XLSX = interop(await import('@e965/xlsx'));

  const book = XLSX.utils.book_new();
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
    sheet.rows.length = 0;
  }

  const bytes = XLSX.write(book, { type: 'array', bookType: 'ods' }) as ArrayBuffer;

  return {
    files: [outputFile(input.name, 'ods', new Uint8Array(bytes))],
    warnings: warnings.length ? warnings : undefined,
  };
}
