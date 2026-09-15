import type { ConversionResult } from '../types';
import { outputFile } from '../shared';
import { readPdf } from './_pdfread';

export async function convert(input: File): Promise<ConversionResult> {
  const { lines, warnings } = await readPdf(input);
  const text = lines.map((line) => line.text).join('\n');

  return {
    files: [outputFile(input.name, 'txt', `${text}\n`)],
    warnings: warnings.length ? warnings : undefined,
  };
}
