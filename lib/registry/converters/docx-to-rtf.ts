import type { ConversionResult } from '../types';
import { outputFile } from '../shared';
import { htmlToBlocks, readDocx } from './_docx';
import { writeRtf } from './_rtf';

export async function convert(input: File): Promise<ConversionResult> {
  const { html, warnings } = await readDocx(input);
  const rtf = writeRtf(htmlToBlocks(html));

  return {
    files: [outputFile(input.name, 'rtf', rtf)],
    warnings: warnings.length ? warnings : undefined,
  };
}
