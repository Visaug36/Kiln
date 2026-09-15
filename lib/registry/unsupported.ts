import type { Format } from './types';

export interface UnsupportedPair {
  from: Format;
  to: Format;
  reason: string;
}

/**
 * Pairs Kiln deliberately does not offer.
 *
 * They all reduce to the same thing: the output's value is its visual layout,
 * and reconstructing that means running a layout and rendering engine. In a
 * browser that means shipping tens of megabytes, or sending the document to a
 * server — and sending it to a server is the one thing Kiln will not do.
 *
 * Listing them is not an apology. The constraint that makes Kiln private is the
 * same constraint that limits it, and saying so plainly is more useful than a
 * disabled menu item or a "coming soon".
 */
export const unsupported: UnsupportedPair[] = [
  {
    from: 'pptx',
    to: 'pdf',
    reason:
      'Slides are a layout, and rendering that layout faithfully needs a full presentation engine — far too large to ship to a browser.',
  },
  {
    from: 'pptx',
    to: 'docx',
    reason:
      'There is no honest mapping from positioned slide elements to a flowing document. The result would be a pile of stray text boxes.',
  },
  {
    from: 'pdf',
    to: 'docx',
    reason:
      'A PDF records where glyphs sit on a page, not paragraphs or headings. Rebuilding an editable document from that is guesswork, and it shows.',
  },
  {
    from: 'pdf',
    to: 'xlsx',
    reason:
      'Table detection in a PDF is inference, not extraction. Wrong numbers in a spreadsheet are worse than no spreadsheet.',
  },
  {
    from: 'pdf',
    to: 'pptx',
    reason:
      'This would mean recovering a document layout and then re-authoring it as slides — two unreliable steps stacked on each other.',
  },
  {
    from: 'xlsx',
    to: 'pptx',
    reason:
      'Turning a sheet into slides means deciding what deserves a slide. That is an editorial judgement, not a conversion.',
  },
  {
    from: 'docx',
    to: 'pptx',
    reason:
      'Same problem in reverse: splitting prose into slides is a writing task, and a converter that guesses at it produces something you would have to redo.',
  },
];

/** The unsupported targets for one source format, if any. */
export function unsupportedFor(from: Format): UnsupportedPair[] {
  return unsupported.filter((pair) => pair.from === from);
}
