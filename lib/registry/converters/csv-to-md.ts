import type { ConversionResult } from '../types';
import { outputFile } from '../shared';
import { readCsv, toPipeTable } from './_sheet';

export async function convert(input: File): Promise<ConversionResult> {
  const { rows, delimiter } = await readCsv(input);
  const markdown = toPipeTable(rows);

  const warnings =
    delimiter === ','
      ? undefined
      : [
          'This file was not comma-separated. Recast detected the separator it actually used.',
        ];

  return { files: [outputFile(input.name, 'md', `${markdown}\n`)], warnings };
}
