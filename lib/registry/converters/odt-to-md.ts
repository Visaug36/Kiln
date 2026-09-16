import type { ConversionResult } from '../types';
import { fail, outputFile } from '../shared';
import { describeOdfMedia, odfTextToHtml, readOdf } from './_odf';
import { htmlToBlocks } from './_docx';
import { blocksToMarkdown } from './_blocks-to-md';

export async function convert(input: File): Promise<ConversionResult> {
  const { content, names } = await readOdf(input, 'odt');
  const { html, warnings } = odfTextToHtml(content);
  const { blocks, warnings: dropped } = htmlToBlocks(html, { inline: 'markdown' });
  const markdown = blocksToMarkdown(blocks);

  if (!markdown.trim()) {
    fail(
      'This document has no text in it. It may hold only images, which Kiln cannot convert.',
    );
  }

  const notes = [...describeOdfMedia(names), ...warnings, ...dropped];

  return {
    files: [outputFile(input.name, 'md', `${markdown}\n`)],
    warnings: notes.length ? notes : undefined,
  };
}
