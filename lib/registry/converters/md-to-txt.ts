import type { ConversionResult } from '../types';
import { outputFile, readText } from '../shared';
import { markdownToPlainText } from './_md';

export async function convert(input: File): Promise<ConversionResult> {
  const text = markdownToPlainText(await readText(input));
  return { files: [outputFile(input.name, 'txt', `${text}\n`)] };
}
