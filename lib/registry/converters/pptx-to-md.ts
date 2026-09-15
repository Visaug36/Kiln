import type { ConversionResult } from '../types';
import { outputFile } from '../shared';
import { readPptx } from './_pptx';

export async function convert(input: File): Promise<ConversionResult> {
  const { slides, warnings } = await readPptx(input);

  const markdown = slides
    .map((slide) => {
      const parts = [`## ${slide.title || `Slide ${slide.index}`}`];
      if (slide.body.length > 0) {
        parts.push('', ...slide.body.map((line) => `- ${line}`));
      }
      if (slide.notes.length > 0) {
        parts.push('', ...slide.notes.map((line) => `> ${line}`));
      }
      return parts.join('\n');
    })
    .join('\n\n');

  return {
    files: [outputFile(input.name, 'md', `${markdown}\n`)],
    warnings: warnings.length ? warnings : undefined,
  };
}
