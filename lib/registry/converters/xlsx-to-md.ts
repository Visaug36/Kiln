import type { ConversionResult } from '../types';
import { outputFile } from '../shared';
import { readWorkbook, toPipeTable } from './_sheet';

export async function convert(input: File): Promise<ConversionResult> {
  const { sheets, warnings } = await readWorkbook(input);
  const many = sheets.length > 1;

  const markdown = sheets
    .map((sheet) => {
      const table = toPipeTable(sheet.rows);
      const body = table || '_This sheet is empty._';
      return many ? `## ${sheet.name}\n\n${body}` : body;
    })
    .join('\n\n');

  return {
    files: [outputFile(input.name, 'md', `${markdown}\n`)],
    warnings: warnings.length ? warnings : undefined,
  };
}
