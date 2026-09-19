import type { ConversionResult, ProgressFn } from '../types';
import { changed, fail, note, outputFile } from '../shared';
import { readEpub } from './_epub';
import { reduceHtml } from './_html';
import { htmlToBlocks } from './_docx';
import { blocksToMarkdown } from './_blocks-to-md';

export async function convert(
  input: File,
  onProgress?: ProgressFn,
): Promise<ConversionResult> {
  const { html, chapters, warnings } = await readEpub(input, onProgress);

  // A chapter is XHTML, so it goes through the same reduction a dropped `.html`
  // file does rather than a second version of it. Without that, `<pre><code>`
  // came back as a fenced block with a stray backtick inside it — the inline
  // code renderer firing on markup the HTML path already knew to collapse.
  const { blocks, warnings: dropped } = htmlToBlocks(reduceHtml(html), {
    inline: 'markdown',
  });
  const markdown = blocksToMarkdown(blocks);

  if (!markdown.trim()) {
    fail('No readable text was found in this book’s chapters.');
  }

  // One chapter is a statement about how it was read. Several chapters became
  // one document, which is a reshaping, so it is not the same severity.
  const spine =
    chapters === 1
      ? note('One chapter was read in the order the book’s spine gives.')
      : changed(
          `${chapters} chapters were read in the order the book’s spine gives, and joined into one document.`,
        );

  const notes = [spine, ...warnings, ...dropped];

  return {
    files: [outputFile(input.name, 'md', `${markdown}\n`)],
    warnings: notes,
  };
}
