import type { Family, Format } from './types';

/** Canonical display order, used wherever a list of formats is shown. */
export const FORMATS: readonly Format[] = [
  // Text-flow
  'pdf',
  'docx',
  'odt',
  'rtf',
  'html',
  'epub',
  'md',
  'txt',
  // Slides
  'pptx',
  'odp',
  // Spreadsheets
  'xlsx',
  'ods',
  'csv',
  'json',
];

/**
 * Which family each format belongs to.
 *
 * `pdf` sits in the text family because everything Recast does with a PDF is
 * text-flow: it reads the text layer and it writes a flowed document. It is
 * not a spreadsheet or a deck in any sense Recast can act on.
 *
 * `json` is a spreadsheet, not a text format, because the only JSON Recast reads
 * or writes is an array of objects — a grid with named columns.
 */
export const FAMILY: Record<Format, Family> = {
  pdf: 'text',
  docx: 'text',
  odt: 'text',
  rtf: 'text',
  html: 'text',
  epub: 'text',
  md: 'text',
  txt: 'text',
  pptx: 'slides',
  odp: 'slides',
  xlsx: 'sheet',
  ods: 'sheet',
  csv: 'sheet',
  json: 'sheet',
};

export function familyOf(format: Format): Family {
  return FAMILY[format];
}

/** How a format is written in prose. `.docx` for most; the odd ones by name. */
export const FORMAT_LABEL: Record<Format, string> = {
  pdf: 'PDF',
  docx: 'Word',
  odt: 'OpenDocument text',
  rtf: 'RTF',
  html: 'HTML',
  epub: 'EPUB',
  md: 'Markdown',
  txt: 'plain text',
  pptx: 'PowerPoint',
  odp: 'OpenDocument presentation',
  xlsx: 'Excel',
  ods: 'OpenDocument spreadsheet',
  csv: 'CSV',
  json: 'JSON',
};

/**
 * The format every other one in a family connects through.
 *
 * A new format needs a reader to its family's hub and a writer from it, and
 * routing reaches the rest — which is what keeps fourteen formats from being a
 * hundred and eighty-two converters. The hub is the richest interchange format
 * in its family, so a path through it carries the most across; routing prefers
 * it over any other intermediate for exactly that reason.
 *
 * Slides have no hub. Recast reads a deck as text and writes one from Markdown,
 * so nothing routes from one deck format to another — there is no layout to
 * carry, and `unsupported.ts` says so.
 */
export const HUB: Partial<Record<Family, Format>> = {
  text: 'md',
  sheet: 'xlsx',
};
