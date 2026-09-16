import type { ConversionResult } from '../types';
import { outputFile } from '../shared';
import { readPptx } from './_pptx';
import { slidesToMarkdown } from './_slides';

export async function convert(input: File): Promise<ConversionResult> {
  const { slides, warnings } = await readPptx(input);

  return {
    files: [outputFile(input.name, 'md', `${slidesToMarkdown(slides)}\n`)],
    warnings: warnings.length ? warnings : undefined,
  };
}
