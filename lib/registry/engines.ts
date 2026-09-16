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
  // ---- Text documents ----
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
  'odt>md': () => import('./converters/odt-to-md').then((m) => m.convert),
  'md>odt': () => import('./converters/md-to-odt').then((m) => m.convert),
  'html>md': () => import('./converters/html-to-md').then((m) => m.convert),
  'md>html': () => import('./converters/md-to-html').then((m) => m.convert),
  'epub>md': () => import('./converters/epub-to-md').then((m) => m.convert),
  'md>epub': () => import('./converters/md-to-epub').then((m) => m.convert),
  'md>rtf': () => import('./converters/md-to-rtf').then((m) => m.convert),

  // ---- Spreadsheets ----
  'xlsx>csv': () => import('./converters/xlsx-to-csv').then((m) => m.convert),
  'xlsx>md': () => import('./converters/xlsx-to-md').then((m) => m.convert),
  'xlsx>txt': () => import('./converters/xlsx-to-txt').then((m) => m.convert),
  'xlsx>pdf': () => import('./converters/xlsx-to-pdf').then((m) => m.convert),
  'xlsx>docx': () => import('./converters/xlsx-to-docx').then((m) => m.convert),
  'csv>xlsx': () => import('./converters/csv-to-xlsx').then((m) => m.convert),
  'csv>md': () => import('./converters/csv-to-md').then((m) => m.convert),
  'csv>txt': () => import('./converters/csv-to-txt').then((m) => m.convert),
  'xlsx>ods': () => import('./converters/xlsx-to-ods').then((m) => m.convert),
  'ods>xlsx': () => import('./converters/ods-to-xlsx').then((m) => m.convert),
  // The workbook engines read whatever SheetJS opens, so ODS goes through the
  // very same modules rather than five copies of them.
  'ods>csv': () => import('./converters/xlsx-to-csv').then((m) => m.convert),
  'ods>md': () => import('./converters/xlsx-to-md').then((m) => m.convert),
  'ods>txt': () => import('./converters/xlsx-to-txt').then((m) => m.convert),
  'ods>pdf': () => import('./converters/xlsx-to-pdf').then((m) => m.convert),
  'ods>docx': () => import('./converters/xlsx-to-docx').then((m) => m.convert),
  'xlsx>json': () => import('./converters/xlsx-to-json').then((m) => m.convert),
  'json>xlsx': () => import('./converters/json-to-xlsx').then((m) => m.convert),

  // ---- Slides ----
  'pptx>txt': () => import('./converters/pptx-to-txt').then((m) => m.convert),
  'pptx>md': () => import('./converters/pptx-to-md').then((m) => m.convert),
  'md>pptx': () => import('./converters/md-to-pptx').then((m) => m.convert),
  'odp>txt': () => import('./converters/odp-to-txt').then((m) => m.convert),
  'odp>md': () => import('./converters/odp-to-md').then((m) => m.convert),
  'md>odp': () => import('./converters/md-to-odp').then((m) => m.convert),
};

/** The engine for one pair, or undefined when the pair is not supported. */
export function engineFor(
  from: Format,
  to: Format,
): (() => Promise<ConvertFn>) | undefined {
  return engines[`${from}>${to}`];
}
