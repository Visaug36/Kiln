import type { ConversionResult } from '../types';
import { baseName, outputFile, readText } from '../shared';
import { markdownToHtmlDocument } from './_html';

export async function convert(input: File): Promise<ConversionResult> {
  const source = await readText(input);
  const html = await markdownToHtmlDocument(source, baseName(input.name));

  return { files: [outputFile(input.name, 'html', html)] };
}
