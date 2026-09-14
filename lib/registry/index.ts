import type { ConvertFn, Converter, Format } from './types';

export type { ConversionResult, ConvertFn, Converter, Fidelity, Format } from './types';

/** Canonical display order, used wherever a list of formats is shown. */
export const FORMATS: readonly Format[] = ['pdf', 'docx', 'md', 'txt', 'rtf'];

/**
 * Placeholder engine. Each real engine will replace this with a dynamic
 * `import()` of its own module, so heavy libraries stay out of the initial
 * bundle and are only fetched when a user actually asks for that pair.
 */
const notImplemented = (): Promise<ConvertFn> =>
  Promise.resolve(() => {
    throw new Error('Not implemented');
  });

/**
 * The single source of truth for what Kiln can convert. The interface reads
 * this table and nothing else: adding a pair is one entry here plus one file
 * under `converters/`, and the format picker updates on its own.
 */
export const converters: Converter[] = [
  {
    from: 'docx',
    to: 'md',
    fidelity: 'good',
    caveat:
      'Headings, lists and emphasis carry over. Fonts, colours and page layout do not.',
    load: notImplemented,
  },
  {
    from: 'docx',
    to: 'txt',
    fidelity: 'good',
    caveat: 'You keep the words and the paragraph breaks. All formatting is dropped.',
    load: notImplemented,
  },
  {
    from: 'docx',
    to: 'pdf',
    fidelity: 'lossy',
    caveat:
      'Pages are laid out again from scratch, so breaks, headers and footers will not match Word exactly.',
    load: notImplemented,
  },
  {
    from: 'md',
    to: 'docx',
    fidelity: 'good',
    caveat:
      'Headings, lists, links and code blocks map to Word styles. Raw HTML is dropped.',
    load: notImplemented,
  },
  {
    from: 'md',
    to: 'pdf',
    fidelity: 'good',
    caveat: 'Rendered with Kiln’s own typography, not your Markdown preview’s.',
    load: notImplemented,
  },
  { from: 'md', to: 'txt', fidelity: 'exact', load: notImplemented },
  { from: 'txt', to: 'md', fidelity: 'exact', load: notImplemented },
  {
    from: 'txt',
    to: 'pdf',
    fidelity: 'good',
    caveat: 'Set in a single typeface at one size. Long lines wrap to the page width.',
    load: notImplemented,
  },
  {
    from: 'txt',
    to: 'docx',
    fidelity: 'good',
    caveat: 'Each blank-line-separated block becomes a paragraph in the default style.',
    load: notImplemented,
  },
  {
    from: 'rtf',
    to: 'txt',
    fidelity: 'good',
    caveat: 'You keep the words and the paragraph breaks. All formatting is dropped.',
    load: notImplemented,
  },
  {
    from: 'rtf',
    to: 'md',
    fidelity: 'lossy',
    caveat:
      'Headings and emphasis are guessed from the font sizes and weights RTF records. Tables and images are dropped.',
    load: notImplemented,
  },
  {
    from: 'pdf',
    to: 'txt',
    fidelity: 'lossy',
    caveat:
      'Only the text layer comes across. Columns may interleave, and a scanned PDF has no text to extract.',
    load: notImplemented,
  },
  {
    from: 'pdf',
    to: 'md',
    fidelity: 'lossy',
    caveat:
      'Headings are inferred from type size, so the structure is an estimate. Images and tables are dropped.',
    load: notImplemented,
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
