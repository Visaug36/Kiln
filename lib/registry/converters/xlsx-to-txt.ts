import type { ConversionResult, ProgressFn } from '../types';
import { outputFile } from '../shared';
import { readWorkbook } from './_sheet';

export async function convert(
  input: File,
  onProgress?: ProgressFn,
): Promise<ConversionResult> {
  const { sheets, warnings } = await readWorkbook(input, onProgress);
  const many = sheets.length > 1;

  const text = sheets
    .map((sheet) => {
      // A tab inside a cell would invent a column that is not there.
      const body = sheet.rows
        .map((row) => row.map((cell) => cell.replace(/\t/g, ' ')).join('\t'))
        .join('\n');
      return many ? `${sheet.name}\n${'='.repeat(sheet.name.length)}\n${body}` : body;
    })
    .join('\n\n');

  return {
    files: [outputFile(input.name, 'txt', `${text}\n`)],
    warnings: warnings.length ? warnings : undefined,
  };
}
