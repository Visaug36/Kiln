import type { ConversionResult } from '../types';
import { note, outputFile, readText } from '../shared';
import { rtfToBlocks } from './_rtf';
import { blocksToMarkdown } from './_blocks-to-md';

export async function convert(input: File): Promise<ConversionResult> {
  const blocks = rtfToBlocks(await readText(input));
  const markdown = blocksToMarkdown(blocks);

  return {
    files: [outputFile(input.name, 'md', `${markdown}\n`)],
    warnings: [
      note(
        'Headings were guessed from font size and weight, so the structure may not match the original.',
      ),
    ],
  };
}
