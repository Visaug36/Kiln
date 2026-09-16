import type { ConversionResult } from '../types';
import { MIME, fail, outputFile, readText } from '../shared';
import { MAX_LIST_DEPTH } from './_md';
import { parseMarkdown } from './_md';
import { deckWarnings, toSlides } from './_slides';

export async function convert(input: File): Promise<ConversionResult> {
  const source = await readText(input);
  const slides = toSlides(await parseMarkdown(source));

  if (slides.length === 0) {
    fail('There was no text to turn into slides.');
  }

  const { default: PptxGenJS } = await import('pptxgenjs');
  const deck = new PptxGenJS();
  deck.layout = 'LAYOUT_16x9';

  for (const slide of slides) {
    const page = deck.addSlide();

    if (slide.title) {
      page.addText(slide.title, {
        x: 0.5,
        y: 0.4,
        w: 9,
        h: 1,
        fontSize: 30,
        bold: true,
        color: '1D1C1A',
      });
    }

    if (slide.bullets.length > 0) {
      page.addText(
        slide.bullets.map(({ text, depth }) => ({
          text,
          options: {
            bullet: true,
            breakLine: true,
            indentLevel: Math.min(depth, MAX_LIST_DEPTH),
          },
        })),
        {
          x: 0.5,
          y: slide.title ? 1.6 : 0.5,
          w: 9,
          h: slide.title ? 3.5 : 4.6,
          fontSize: 16,
          color: '3A3835',
          valign: 'top',
        },
      );
    }
  }

  // pptxgenjs hands back a blob typed application/zip, which is technically
  // true of every OOXML file and useless to anything that opens it.
  const raw = (await deck.write({ outputType: 'blob' })) as Blob;
  const blob = new Blob([raw], { type: MIME.pptx });

  const warnings = deckWarnings(source, slides);

  return {
    files: [{ blob, filename: outputFile(input.name, 'pptx', '').filename }],
    warnings: warnings.length ? warnings : undefined,
  };
}
