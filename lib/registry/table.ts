import type { Converter } from './types';

/**
 * Every conversion Recast performs in one step.
 *
 * This is a list of **edges**, not of pairs. Most pairs Recast offers are two of
 * these run back to back — `routing.ts` computes those. Adding a format here
 * means declaring its edges to the nearest existing format and letting routing
 * reach the rest; fourteen formats would otherwise be 182 hand-written
 * converters.
 *
 * Each family has a hub that everything else connects through: Markdown for
 * text documents, Excel for spreadsheets. A new format needs a reader to the
 * hub and a writer from it, and it is reachable from everything in its family.
 *
 * There are deliberately no `import()` calls here. This module is reached from
 * the page, and a dynamic import in it makes the page's bundler emit a chunk
 * for every engine — several megabytes that the page then never loads, because
 * conversions happen in the worker. The engines live in `engines.ts`, which
 * only the worker imports. `index.test.ts` keeps the two in step.
 */
export const converters: Converter[] = [
  // ---- Text documents: everything meets at Markdown ----
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
    from: 'odt',
    to: 'md',
    fidelity: 'good',
    caveat:
      'Headings, lists, tables and emphasis carry over. Fonts, colours and page layout do not.',
  },
  {
    from: 'md',
    to: 'odt',
    fidelity: 'good',
    caveat:
      'Headings, lists, quotes, code blocks and tables map to OpenDocument styles. Inline emphasis and links are not carried.',
  },
  {
    from: 'html',
    to: 'md',
    fidelity: 'lossy',
    caveat:
      'Headings, lists, tables, links and emphasis carry over. Styling, scripts, images and anything that depends on layout are dropped.',
  },
  {
    from: 'md',
    to: 'html',
    fidelity: 'good',
    caveat:
      'A standalone HTML document with semantic tags and no stylesheet, so it takes on whatever styles surround it. The one target that keeps inline emphasis and links intact.',
  },
  {
    from: 'epub',
    to: 'md',
    fidelity: 'lossy',
    caveat:
      'Chapters are read in spine order and joined into one document. The cover, table of contents, metadata and styling are dropped.',
  },
  {
    from: 'md',
    to: 'epub',
    fidelity: 'good',
    caveat:
      'Each top-level heading starts a chapter. The book is unstyled, and images, inline emphasis and links are not carried.',
  },
  {
    from: 'md',
    to: 'docx',
    fidelity: 'good',
    caveat:
      'Headings, lists, quotes, code blocks and tables map to Word styles. Inline emphasis and links are not carried, and raw HTML is dropped.',
  },
  {
    from: 'md',
    to: 'pdf',
    fidelity: 'good',
    caveat:
      'Rendered with Recast’s own typography, not your Markdown preview’s. Inline emphasis and links are not carried.',
  },
  {
    from: 'md',
    to: 'rtf',
    fidelity: 'lossy',
    caveat:
      'Headings, lists and quotes survive as formatted text. Tables become tab-separated lines, and inline emphasis and links are not carried.',
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
      'Heading levels are ranked by the font sizes RTF records, largest first, so they are an estimate — a pull quote set large reads as a heading. Tables and images are dropped.',
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
      'Headings are ranked by type size, and paragraphs are split where the line spacing widens — both are inferences, because a PDF records neither. Two short paragraphs set close together can still run into one. Images, tables and multi-column layouts are dropped.',
  },

  // ---- Spreadsheets: everything meets at Excel ----
  {
    from: 'xlsx',
    to: 'csv',
    fidelity: 'exact',
  },
  {
    from: 'xlsx',
    to: 'ods',
    fidelity: 'good',
    caveat:
      'Cell values and sheet names carry over. Formulas, charts, images and cell formatting are dropped.',
  },
  {
    from: 'xlsx',
    to: 'json',
    fidelity: 'good',
    caveat:
      'Each sheet becomes an array of objects keyed by its first row. Formulas, charts and formatting are dropped, and every value arrives as a string.',
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
  // ODS is the sibling of XLSX, and these five engines never cared which of the
  // two they were handed — SheetJS reads both, and they work on rows. Declaring
  // the edges records a capability that already existed. Leaving them out would
  // have given `xlsx → odt` while refusing `ods → odt`, which is the sibling
  // drift this codebase has been bitten by four times.
  {
    from: 'ods',
    to: 'xlsx',
    fidelity: 'good',
    caveat:
      'Cell values and sheet names carry over. Formulas, charts, images and cell formatting are dropped.',
  },
  {
    from: 'ods',
    to: 'csv',
    fidelity: 'exact',
  },
  {
    from: 'ods',
    to: 'md',
    fidelity: 'good',
    caveat:
      'One pipe table per sheet. Formatting, formulas and merged cells are dropped.',
  },
  {
    from: 'ods',
    to: 'txt',
    fidelity: 'good',
    caveat: 'Tab-separated, one block per sheet. Only the values survive.',
  },
  {
    from: 'ods',
    to: 'pdf',
    fidelity: 'lossy',
    caveat:
      'Each sheet is drawn as a plain table. Sheets wider than the page are clipped, and charts and formatting are dropped.',
  },
  {
    from: 'ods',
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
  {
    from: 'json',
    to: 'xlsx',
    fidelity: 'good',
    caveat:
      'An array of objects becomes rows, with the keys as the header row. Nested objects are flattened to dotted keys — `address.city` — and arrays inside a value become comma-separated text.',
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
    from: 'odp',
    to: 'txt',
    fidelity: 'lossy',
    caveat:
      'Slide text only, in reading order. Layout, images, charts and speaker notes formatting are dropped.',
  },
  {
    from: 'odp',
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
      'Each top-level heading starts a slide. A table becomes one bullet per row, and images, inline emphasis and links are not carried.',
  },
  {
    from: 'md',
    to: 'odp',
    fidelity: 'good',
    caveat:
      'Each top-level heading starts a slide. The deck is unstyled, a table becomes one bullet per row, and images, inline emphasis and links are not carried.',
  },
];
