import type { ConvertFn, Format } from './types';

/**
 * Where the engines actually are.
 *
 * Imported by the conversion worker and by nothing else. Keeping it out of
 * the module the page imports is what stops the page's bundler from emitting
 * a chunk per engine — about 4 MB of files that were built, deployed and
 * never fetched, because every conversion runs in the worker.
 *
 * Each value is a dynamic import, so an engine arrives only when a conversion
 * using it starts. Engines that share a library share its chunk: converting
 * docx → md and then docx → pdf downloads mammoth once.
 */
export const engines: Record<string, () => Promise<ConvertFn>> = {
  'docx>md': () => import('./converters/docx-to-md').then((m) => m.convert),
  'docx>txt': () => import('./converters/docx-to-txt').then((m) => m.convert),
  'docx>pdf': () => import('./converters/docx-to-pdf').then((m) => m.convert),
  'docx>rtf': () => import('./converters/docx-to-rtf').then((m) => m.convert),
  'md>docx': () => import('./converters/md-to-docx').then((m) => m.convert),
  'md>pdf': () => import('./converters/md-to-pdf').then((m) => m.convert),
  'md>txt': () => import('./converters/md-to-txt').then((m) => m.convert),
  'txt>md': () => import('./converters/txt-to-md').then((m) => m.convert),
  'txt>docx': () => import('./converters/txt-to-docx').then((m) => m.convert),
  'txt>pdf': () => import('./converters/txt-to-pdf').then((m) => m.convert),
  'rtf>txt': () => import('./converters/rtf-to-txt').then((m) => m.convert),
  'rtf>md': () => import('./converters/rtf-to-md').then((m) => m.convert),
  'pdf>txt': () => import('./converters/pdf-to-txt').then((m) => m.convert),
  'pdf>md': () => import('./converters/pdf-to-md').then((m) => m.convert),
  'xlsx>csv': () => import('./converters/xlsx-to-csv').then((m) => m.convert),
  'xlsx>md': () => import('./converters/xlsx-to-md').then((m) => m.convert),
  'xlsx>txt': () => import('./converters/xlsx-to-txt').then((m) => m.convert),
  'xlsx>pdf': () => import('./converters/xlsx-to-pdf').then((m) => m.convert),
  'xlsx>docx': () => import('./converters/xlsx-to-docx').then((m) => m.convert),
  'csv>xlsx': () => import('./converters/csv-to-xlsx').then((m) => m.convert),
  'csv>md': () => import('./converters/csv-to-md').then((m) => m.convert),
  'csv>txt': () => import('./converters/csv-to-txt').then((m) => m.convert),
  'pptx>txt': () => import('./converters/pptx-to-txt').then((m) => m.convert),
  'pptx>md': () => import('./converters/pptx-to-md').then((m) => m.convert),
  'md>pptx': () => import('./converters/md-to-pptx').then((m) => m.convert),
};

/** The engine for one pair, or undefined when the pair is not supported. */
export function engineFor(
  from: Format,
  to: Format,
): (() => Promise<ConvertFn>) | undefined {
  return engines[`${from}>${to}`];
}
