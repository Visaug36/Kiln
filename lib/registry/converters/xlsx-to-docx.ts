import type { ConversionResult } from '../types';
import { baseName, outputFile } from '../shared';
import { readWorkbook } from './_sheet';
import { writeDocx } from './_docx';
import type { Block } from './_md';

export async function convert(input: File): Promise<ConversionResult> {
  const { sheets, warnings } = await readWorkbook(input);
  const many = sheets.length > 1;

  const blocks: Block[] = [];
  for (const sheet of sheets) {
    if (sheet.rows.length === 0) continue;
    if (many) blocks.push({ kind: 'heading', level: 2, text: sheet.name });
    blocks.push({ kind: 'table', rows: sheet.rows });
  }

  const bytes = await writeDocx(blocks, baseName(input.name));

  return {
    files: [outputFile(input.name, 'docx', bytes)],
    warnings: warnings.length ? warnings : undefined,
  };
}
