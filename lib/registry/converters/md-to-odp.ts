import type { ConversionResult } from '../types';
import { baseName, fail, outputFile, readText } from '../shared';
import { parseMarkdown } from './_md';
import { deckWarnings, toSlides } from './_slides';
import { packOdf, slidesToOdfPresentation } from './_odf';

export async function convert(input: File): Promise<ConversionResult> {
  const source = await readText(input);
  const slides = toSlides(await parseMarkdown(source));

  if (slides.length === 0) {
    fail('There was no text to turn into slides.');
  }

  const body = slidesToOdfPresentation(slides);
  const bytes = await packOdf('odp', body, baseName(input.name));
  const warnings = deckWarnings(source, slides);

  return {
    files: [outputFile(input.name, 'odp', bytes)],
    warnings: warnings.length ? warnings : undefined,
  };
}
