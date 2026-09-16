import type { ConversionResult } from '../types';
import { baseName, outputFile, readText } from '../shared';
import { parseMarkdown } from './_md';
import { blocksToOdfText, packOdf } from './_odf';

export async function convert(input: File): Promise<ConversionResult> {
  const source = await readText(input);
  const blocks = await parseMarkdown(source);
  const bytes = await packOdf('odt', blocksToOdfText(blocks), baseName(input.name));

  const warnings = /<[a-z][\s\S]*>/i.test(source)
    ? ['Raw HTML in the Markdown was dropped; OpenDocument has no equivalent for it.']
    : undefined;

  return { files: [outputFile(input.name, 'odt', bytes)], warnings };
}
