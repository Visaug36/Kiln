import type { ConversionResult, ProgressFn } from '../types';
import { outputFile } from '../shared';
import { readPdf } from './_pdfread';

export async function convert(
  input: File,
  onProgress?: ProgressFn,
): Promise<ConversionResult> {
  const { lines, warnings } = await readPdf(input, onProgress);
  const text = lines.map((line) => line.text).join('\n');

  return {
    files: [outputFile(input.name, 'txt', `${text}\n`)],
    warnings: warnings.length ? warnings : undefined,
  };
}
