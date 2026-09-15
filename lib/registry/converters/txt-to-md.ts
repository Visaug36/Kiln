import type { ConversionResult } from '../types';
import { outputFile, readText } from '../shared';

/**
 * Plain text is already valid Markdown, so the bytes pass through untouched.
 * Escaping stray `*` or `_` would change the words, and this pair is declared
 * `exact` — the file you get back says exactly what you put in.
 */
export async function convert(input: File): Promise<ConversionResult> {
  const text = await readText(input);
  return { files: [outputFile(input.name, 'md', text)] };
}
