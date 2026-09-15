import type { ConversionResult } from '../types';
import { outputFile } from '../shared';
import { readPptx } from './_pptx';

export async function convert(input: File): Promise<ConversionResult> {
  const { slides, warnings } = await readPptx(input);

  const text = slides
    .map((slide) => {
      const lines = [`Slide ${slide.index}`];
      if (slide.title) lines.push(slide.title);
      lines.push(...slide.body);
      if (slide.notes.length > 0) lines.push('', 'Notes:', ...slide.notes);
      return lines.join('\n');
    })
    .join('\n\n');

  return {
    files: [outputFile(input.name, 'txt', `${text}\n`)],
    warnings: warnings.length ? warnings : undefined,
  };
}
