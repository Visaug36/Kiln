import type { ConversionResult, ProgressFn } from '../types';
import { note, outputFile } from '../shared';
import { pdfLinesToBlocks, readPdf } from './_pdfread';
import { blocksToMarkdown } from './_blocks-to-md';

export async function convert(
  input: File,
  onProgress?: ProgressFn,
): Promise<ConversionResult> {
  const { lines, warnings } = await readPdf(input, onProgress);
  const markdown = blocksToMarkdown(pdfLinesToBlocks(lines));

  return {
    files: [outputFile(input.name, 'md', `${markdown}\n`)],
    warnings: [
      // Nothing went missing and nothing was reshaped — this says how the
      // reader worked and what to look at, which is what `note` is for.
      note(
        'Headings were inferred from type size. A PDF does not record structure, so check them.',
      ),
      ...warnings,
    ],
  };
}
