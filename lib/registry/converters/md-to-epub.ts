import type { ConversionResult } from '../types';
import { baseName, changed, fail, lost, outputFile, readText } from '../shared';
import type { Warning } from '../types';
import { parseMarkdown } from './_md';
import { packEpub, toChapters } from './_epub';

export async function convert(input: File): Promise<ConversionResult> {
  const source = await readText(input);
  const title = baseName(input.name);
  const chapters = toChapters(await parseMarkdown(source), title);

  if (chapters.length === 0) {
    fail('There was no text to turn into a book.');
  }

  const bytes = await packEpub(chapters, title);

  const warnings: Warning[] = [];
  // Safe to say "in the Markdown": no reader can emit `![]()`, so this only
  // fires for Markdown somebody wrote. See the same note in `_slides.ts`.
  if (/!\[[^\]]*\]\([^)]*\)/.test(source)) {
    warnings.push(lost('Images in the Markdown were not carried into the book.'));
  }
  if (chapters.length === 1) {
    // This used to end "Add `#` headings to split it up." Eleven pairs route
    // into EPUB through Markdown — a deck, a workbook, a PDF — and on every one
    // of them Recast wrote that Markdown, so the advice was addressed to
    // somebody who does not exist. The outcome was always the true half.
    warnings.push(
      changed('The document had no top-level headings, so it became a single chapter.'),
    );
  }

  return {
    files: [outputFile(input.name, 'epub', bytes)],
    warnings: warnings.length ? warnings : undefined,
  };
}
