import type { Converter, Format } from './types';

export type {
  ConversionResult,
  ConvertFn,
  Converter,
  Fidelity,
  Format,
  OutputFile,
} from './types';
export { unsupported, unsupportedFor, type UnsupportedPair } from './unsupported';

/** Canonical display order, used wherever a list of formats is shown. */
export const FORMATS: readonly Format[] = [
  'pdf',
  'docx',
  'pptx',
  'xlsx',
  'csv',
  'md',
  'txt',
  'rtf',
];

/**
 * What Kiln can convert, and how well. The interface reads this table and
 * nothing else, so the format picker updates on its own when a pair is added.
 *
 * There are deliberately no `import()` calls here. This module is reached from
 * the page, and a dynamic import in it makes the page's bundler emit a chunk
 * for every engine — several megabytes that the page then never loads, because
 * conversions happen in the worker. The engines live in `engines.ts`, which
 * only the worker imports. `registry.test.ts` keeps the two in step.
 */
export const converters: Converter[] = [
  // ---- Text documents ----
  {
    from: 'docx',
    to: 'md',
    fidelity: 'good',
    caveat:
      'Headings, lists, links and emphasis carry over. Fonts, colours and page layout do not.',
  },
  {
    from: 'docx',
    to: 'txt',
    fidelity: 'good',
    caveat: 'You keep the words and the paragraph breaks. All formatting is dropped.',
  },
  {
    from: 'docx',
    to: 'pdf',
    fidelity: 'lossy',
    caveat:
      'Styles are approximated and the page is laid out again from scratch, so breaks, headers, footers and columns will not match Word.',
  },
  {
    from: 'docx',
    to: 'rtf',
    fidelity: 'lossy',
    caveat:
      'Headings, emphasis and lists survive as formatted text. Tables, images and precise spacing do not.',
  },
  {
    from: 'md',
    to: 'docx',
    fidelity: 'good',
    caveat:
      'Headings, lists, links, quotes and code blocks map to Word styles. Raw HTML is dropped.',
  },
  {
    from: 'md',
    to: 'pdf',
    fidelity: 'good',
    caveat: 'Rendered with Kiln’s own typography, not your Markdown preview’s.',
  },
  {
    from: 'md',
    to: 'txt',
    fidelity: 'exact',
  },
  {
    from: 'txt',
    to: 'md',
    fidelity: 'exact',
  },
  {
    from: 'txt',
    to: 'docx',
    fidelity: 'good',
    caveat: 'Each blank-line-separated block becomes a paragraph in the default style.',
  },
  {
    from: 'txt',
    to: 'pdf',
    fidelity: 'good',
    caveat: 'Set in a single typeface at one size. Long lines wrap to the page width.',
  },
  {
    from: 'rtf',
    to: 'txt',
    fidelity: 'good',
    caveat: 'You keep the words and the paragraph breaks. All formatting is dropped.',
  },
  {
    from: 'rtf',
    to: 'md',
    fidelity: 'lossy',
    caveat:
      'Headings and emphasis are guessed from the font sizes and weights RTF records, so the structure is an estimate. Tables and images are dropped.',
  },
  {
    from: 'pdf',
    to: 'txt',
    fidelity: 'lossy',
    caveat:
      'Only the text layer comes across. Columns may interleave, and a scanned PDF has no text to extract.',
  },
  {
    from: 'pdf',
    to: 'md',
    fidelity: 'lossy',
    caveat:
      'Headings are inferred from type size, which is unreliable. Images, tables and multi-column layouts are dropped.',
  },

  // ---- Spreadsheets ----
  {
    from: 'xlsx',
    to: 'csv',
    fidelity: 'exact',
  },
  {
    from: 'xlsx',
    to: 'md',
    fidelity: 'good',
    caveat:
      'One pipe table per sheet. Formatting, formulas and merged cells are dropped.',
  },
  {
    from: 'xlsx',
    to: 'txt',
    fidelity: 'good',
    caveat: 'Tab-separated, one block per sheet. Only the values survive.',
  },
  {
    from: 'xlsx',
    to: 'pdf',
    fidelity: 'lossy',
    caveat:
      'Each sheet is drawn as a plain table. Sheets wider than the page are clipped, and charts and formatting are dropped.',
  },
  {
    from: 'xlsx',
    to: 'docx',
    fidelity: 'lossy',
    caveat:
      'Values become Word tables. Formulas, charts, images and cell formatting are dropped.',
  },
  {
    from: 'csv',
    to: 'xlsx',
    fidelity: 'exact',
  },
  {
    from: 'csv',
    to: 'md',
    fidelity: 'good',
    caveat: 'Becomes a pipe table, with the first row treated as the header.',
  },
  {
    from: 'csv',
    to: 'txt',
    fidelity: 'exact',
  },

  // ---- Slides ----
  {
    from: 'pptx',
    to: 'txt',
    fidelity: 'lossy',
    caveat:
      'Slide text only, in reading order. Layout, images, charts and speaker notes formatting are dropped.',
  },
  {
    from: 'pptx',
    to: 'md',
    fidelity: 'lossy',
    caveat:
      'One heading per slide with its bullets beneath. Everything visual about the deck is dropped.',
  },
  {
    from: 'md',
    to: 'pptx',
    fidelity: 'good',
    caveat:
      'Each top-level heading starts a slide. Images and tables are not carried over.',
  },
];

/** Every format `from` can become, in canonical order. Drives the format picker. */
export function targetsFor(from: Format): Format[] {
  const available = new Set(converters.filter((c) => c.from === from).map((c) => c.to));
  return FORMATS.filter((f) => available.has(f));
}

/** The converter for one pair, or `undefined` when the pair is not supported. */
export function find(from: Format, to: Format): Converter | undefined {
  return converters.find((c) => c.from === from && c.to === to);
}
