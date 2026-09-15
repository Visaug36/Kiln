import type { ConversionResult } from '../types';
import { outputFile, readText } from '../shared';

/**
 * A CSV is already plain text, so the bytes pass through unchanged. Re-aligning
 * the columns would be prettier and would make the pair inexact.
 */
export async function convert(input: File): Promise<ConversionResult> {
  const text = await readText(input);
  return { files: [outputFile(input.name, 'txt', text)] };
}
