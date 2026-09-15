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
 * The single source of truth for what Kiln can convert. The interface reads
 * this table and nothing else: adding a pair is one entry here plus one file
 * under `converters/`, and the format picker updates on its own.
 *
 * Every `load` is a dynamic import. That is not a style preference — it is the
 * only reason a PDF or spreadsheet engine can exist in this project without
 * every visitor downloading it up front. See scripts/check-bundle.mjs, which
 * fails the build if one of them reaches the entry chunk.
 */
export const converters: Converter[] = [
  // ---- Text documents ----
  {
    from: 'docx',
    to: 'md',
    fidelity: 'good',
    caveat:
      'Headings, lists, links and emphasis carry over. Fonts, colours and page layout do not.',
    load: () => import('./converters/docx-to-md').then((m) => m.convert),
  },
  {
    from: 'docx',
    to: 'txt',
    fidelity: 'good',
    caveat: 'You keep the words and the paragraph breaks. All formatting is dropped.',
    load: () => import('./converters/docx-to-txt').then((m) => m.convert),
  },
  {
    from: 'docx',
    to: 'pdf',
    fidelity: 'lossy',
    caveat:
      'Styles are approximated and the page is laid out again from scratch, so breaks, headers, footers and columns will not match Word.',
    load: () => import('./converters/docx-to-pdf').then((m) => m.convert),
  },
  {
    from: 'docx',
    to: 'rtf',
    fidelity: 'lossy',
    caveat:
      'Headings, emphasis and lists survive as formatted text. Tables, images and precise spacing do not.',
    load: () => import('./converters/docx-to-rtf').then((m) => m.convert),
  },
  {
    from: 'md',
    to: 'docx',
    fidelity: 'good',
    caveat:
      'Headings, lists, links, quotes and code blocks map to Word styles. Raw HTML is dropped.',
    load: () => import('./converters/md-to-docx').then((m) => m.convert),
  },
  {
    from: 'md',
    to: 'pdf',
    fidelity: 'good',
    caveat: 'Rendered with Kiln’s own typography, not your Markdown preview’s.',
    load: () => import('./converters/md-to-pdf').then((m) => m.convert),
  },
  {
    from: 'md',
    to: 'txt',
    fidelity: 'exact',
    load: () => import('./converters/md-to-txt').then((m) => m.convert),
  },
  {
    from: 'txt',
    to: 'md',
    fidelity: 'exact',
    load: () => import('./converters/txt-to-md').then((m) => m.convert),
  },
  {
    from: 'txt',
    to: 'docx',
    fidelity: 'good',
    caveat: 'Each blank-line-separated block becomes a paragraph in the default style.',
    load: () => import('./converters/txt-to-docx').then((m) => m.convert),
  },
  {
    from: 'txt',
    to: 'pdf',
    fidelity: 'good',
    caveat: 'Set in a single typeface at one size. Long lines wrap to the page width.',
    load: () => import('./converters/txt-to-pdf').then((m) => m.convert),
  },
  {
    from: 'rtf',
    to: 'txt',
    fidelity: 'good',
    caveat: 'You keep the words and the paragraph breaks. All formatting is dropped.',
    load: () => import('./converters/rtf-to-txt').then((m) => m.convert),
  },
  {
    from: 'rtf',
    to: 'md',
    fidelity: 'lossy',
    caveat:
      'Headings and emphasis are guessed from the font sizes and weights RTF records, so the structure is an estimate. Tables and images are dropped.',
    load: () => import('./converters/rtf-to-md').then((m) => m.convert),
  },
  {
    from: 'pdf',
    to: 'txt',
    fidelity: 'lossy',
    caveat:
      'Only the text layer comes across. Columns may interleave, and a scanned PDF has no text to extract.',
    load: () => import('./converters/pdf-to-txt').then((m) => m.convert),
  },
  {
    from: 'pdf',
    to: 'md',
    fidelity: 'lossy',
    caveat:
      'Headings are inferred from type size, which is unreliable. Images, tables and multi-column layouts are dropped.',
    load: () => import('./converters/pdf-to-md').then((m) => m.convert),
  },

  // ---- Spreadsheets ----
  {
    from: 'xlsx',
    to: 'csv',
    fidelity: 'exact',
    load: () => import('./converters/xlsx-to-csv').then((m) => m.convert),
  },
  {
    from: 'xlsx',
    to: 'md',
    fidelity: 'good',
    caveat:
      'One pipe table per sheet. Formatting, formulas and merged cells are dropped.',
    load: () => import('./converters/xlsx-to-md').then((m) => m.convert),
  },
  {
    from: 'xlsx',
    to: 'txt',
    fidelity: 'good',
    caveat: 'Tab-separated, one block per sheet. Only the values survive.',
    load: () => import('./converters/xlsx-to-txt').then((m) => m.convert),
  },
  {
    from: 'xlsx',
    to: 'pdf',
    fidelity: 'lossy',
    caveat:
      'Each sheet is drawn as a plain table. Sheets wider than the page are clipped, and charts and formatting are dropped.',
    load: () => import('./converters/xlsx-to-pdf').then((m) => m.convert),
  },
  {
    from: 'xlsx',
    to: 'docx',
    fidelity: 'lossy',
    caveat:
      'Values become Word tables. Formulas, charts, images and cell formatting are dropped.',
    load: () => import('./converters/xlsx-to-docx').then((m) => m.convert),
  },
  {
    from: 'csv',
    to: 'xlsx',
    fidelity: 'exact',
    load: () => import('./converters/csv-to-xlsx').then((m) => m.convert),
  },
  {
    from: 'csv',
    to: 'md',
    fidelity: 'good',
    caveat: 'Becomes a pipe table, with the first row treated as the header.',
    load: () => import('./converters/csv-to-md').then((m) => m.convert),
  },
  {
    from: 'csv',
    to: 'txt',
    fidelity: 'exact',
    load: () => import('./converters/csv-to-txt').then((m) => m.convert),
  },

  // ---- Slides ----
  {
    from: 'pptx',
    to: 'txt',
    fidelity: 'lossy',
    caveat:
      'Slide text only, in reading order. Layout, images, charts and speaker notes formatting are dropped.',
    load: () => import('./converters/pptx-to-txt').then((m) => m.convert),
  },
  {
    from: 'pptx',
    to: 'md',
    fidelity: 'lossy',
    caveat:
      'One heading per slide with its bullets beneath. Everything visual about the deck is dropped.',
    load: () => import('./converters/pptx-to-md').then((m) => m.convert),
  },
  {
    from: 'md',
    to: 'pptx',
    fidelity: 'good',
    caveat:
      'Each top-level heading starts a slide. Images and tables are not carried over.',
    load: () => import('./converters/md-to-pptx').then((m) => m.convert),
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
