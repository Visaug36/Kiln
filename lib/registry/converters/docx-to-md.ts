import type { ConversionResult } from '../types';
import { outputFile } from '../shared';
import { htmlToBlocks, readDocx } from './_docx';
import { blocksToMarkdown } from './_blocks-to-md';

export async function convert(input: File): Promise<ConversionResult> {
  const { html, warnings } = await readDocx(input);
  const markdown = blocksToMarkdown(htmlToBlocks(html, { inline: 'markdown' }));

  return {
    files: [outputFile(input.name, 'md', `${markdown}\n`)],
    warnings: warnings.length ? warnings : undefined,
  };
}
