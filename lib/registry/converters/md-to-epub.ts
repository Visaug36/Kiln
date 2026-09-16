import type { ConversionResult } from '../types';
import { baseName, fail, outputFile, readText } from '../shared';
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

  const warnings: string[] = [];
  if (/!\[[^\]]*\]\([^)]*\)/.test(source)) {
    warnings.push('Images in the Markdown were not carried into the book.');
  }
  if (chapters.length === 1) {
    warnings.push(
      'There were no top-level headings, so the whole document became a single chapter. Add `#` headings to split it up.',
    );
  }

  return {
    files: [outputFile(input.name, 'epub', bytes)],
    warnings: warnings.length ? warnings : undefined,
  };
}
