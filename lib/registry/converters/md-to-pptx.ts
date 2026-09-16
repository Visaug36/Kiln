import type { ConversionResult } from '../types';
import { MIME, fail, outputFile, readText } from '../shared';
import { MAX_LIST_DEPTH, parseMarkdown, type Block } from './_md';

interface Line {
  text: string;
  /** Nesting level, so a sub-point sits under its parent rather than beside it. */
  depth: number;
}

interface Deck {
  title: string;
  bullets: Line[];
}

/** Splits the block list into slides, one per top-level heading. */
function toSlides(blocks: Block[]): Deck[] {
  const slides: Deck[] = [];
  let current: Deck | null = null;

  const open = (title: string) => {
    current = { title, bullets: [] };
    slides.push(current);
  };

  for (const block of blocks) {
    if (block.kind === 'heading' && block.level <= 1) {
      open(block.text);
      continue;
    }
    if (!current) open('');

    switch (block.kind) {
      case 'heading':
        current!.bullets.push({ text: block.text, depth: 0 });
        break;
      case 'bullet':
        current!.bullets.push({ text: block.text, depth: block.depth });
        break;
      case 'paragraph':
      case 'quote':
        current!.bullets.push({ text: block.text, depth: 0 });
        break;
      case 'code':
        for (const line of block.text.split('\n').filter(Boolean)) {
          current!.bullets.push({ text: line, depth: 0 });
        }
        break;
      case 'table':
        for (const row of block.rows) {
          current!.bullets.push({ text: row.join(' — '), depth: 0 });
        }
        break;
      default:
        break;
    }
  }

  return slides.filter((slide) => slide.title || slide.bullets.length > 0);
}

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

  const warnings: string[] = [];
  if (/!\[[^\]]*\]\([^)]*\)/.test(source)) {
    warnings.push('Images in the Markdown were not carried onto the slides.');
  }
  const long = slides.filter((s) => s.bullets.length > 12).length;
  if (long > 0) {
    warnings.push(
      `${long} slide${long === 1 ? '' : 's'} had more than 12 bullets and will overflow — split those headings up.`,
    );
  }

  return {
    files: [{ blob, filename: outputFile(input.name, 'pptx', '').filename }],
    warnings: warnings.length ? warnings : undefined,
  };
}
