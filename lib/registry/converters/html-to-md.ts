import type { ConversionResult } from '../types';
import { fail, outputFile, readText } from '../shared';
import { readHtmlDocument } from './_html';
import { htmlToBlocks } from './_docx';
import { blocksToMarkdown } from './_blocks-to-md';

export async function convert(input: File): Promise<ConversionResult> {
  const { html, warnings } = readHtmlDocument(await readText(input));
  const { blocks, warnings: dropped } = htmlToBlocks(html, { inline: 'markdown' });
  const markdown = blocksToMarkdown(blocks);

  if (!markdown.trim()) {
    fail('This page has no readable text in it — only markup Kiln cannot carry.');
  }

  const notes = [...warnings, ...dropped];

  return {
    files: [outputFile(input.name, 'md', `${markdown}\n`)],
    warnings: notes.length ? notes : undefined,
  };
}
