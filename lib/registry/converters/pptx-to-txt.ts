import type { ConversionResult } from '../types';
import { outputFile } from '../shared';
import { readPptx } from './_pptx';
import { slidesToText } from './_slides';

export async function convert(input: File): Promise<ConversionResult> {
  const { slides, warnings } = await readPptx(input);

  return {
    files: [outputFile(input.name, 'txt', `${slidesToText(slides)}\n`)],
    warnings: warnings.length ? warnings : undefined,
  };
}
