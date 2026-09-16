import type { ConversionResult } from '../types';
import { fail, outputFile } from '../shared';
import { htmlToBlocks, readDocx } from './_docx';
import { blocksToMarkdown } from './_blocks-to-md';

export async function convert(input: File): Promise<ConversionResult> {
  const { html, warnings } = await readDocx(input);
  const { blocks, warnings: dropped } = htmlToBlocks(html, { inline: 'markdown' });
  const markdown = blocksToMarkdown(blocks);

  // A document of nothing but pictures converts to an empty file. Handing that
  // back as a finished conversion is worse than refusing it.
  const notes = [...warnings, ...dropped];

  if (!markdown.trim()) {
    fail(
      'This document has no text in it. It may hold only images, which Kiln cannot convert.',
    );
  }

  return {
    files: [outputFile(input.name, 'md', `${markdown}\n`)],
    warnings: notes.length ? notes : undefined,
  };
}
