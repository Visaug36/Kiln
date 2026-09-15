import type { ConversionResult } from '../types';
import { outputFile } from '../shared';
import { pdfLinesToBlocks, readPdf } from './_pdfread';
import { blocksToMarkdown } from './_blocks-to-md';

export async function convert(input: File): Promise<ConversionResult> {
  const { lines, warnings } = await readPdf(input);
  const markdown = blocksToMarkdown(pdfLinesToBlocks(lines));

  return {
    files: [outputFile(input.name, 'md', `${markdown}\n`)],
    warnings: [
      'Headings were inferred from type size. A PDF does not record structure, so check them.',
      ...warnings,
    ],
  };
}
