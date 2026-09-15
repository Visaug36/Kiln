import type { ConversionResult } from '../types';
import { outputFile, readText } from '../shared';
import { rtfToPlainText } from './_rtf';

export async function convert(input: File): Promise<ConversionResult> {
  const text = rtfToPlainText(await readText(input));
  return { files: [outputFile(input.name, 'txt', `${text}\n`)] };
}
