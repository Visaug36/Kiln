import type { ConversionResult } from '../types';
import { outputFile } from '../shared';
import { describeOdfMedia, odfPresentationToSlides, readOdf } from './_odf';
import { slidesToMarkdown } from './_slides';

export async function convert(input: File): Promise<ConversionResult> {
  const { content, names } = await readOdf(input, 'odp');
  const slides = odfPresentationToSlides(content);
  const warnings = describeOdfMedia(names);

  return {
    files: [outputFile(input.name, 'md', `${slidesToMarkdown(slides)}\n`)],
    warnings: warnings.length ? warnings : undefined,
  };
}
