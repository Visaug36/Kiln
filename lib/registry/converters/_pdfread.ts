import { describeFailure, fail, lost, readArrayBuffer } from '../shared';
import type { ProgressFn, Warning } from '../types';
import type { Block } from './_md';

export interface PdfLine {
  text: string;
  /** Transformed glyph height, used to guess headings. */
  size: number;
  page: number;
  /**
   * Baseline position on the page, measured up from the bottom.
   *
   * The gap between two baselines is the one real signal a PDF gives about
   * where a paragraph ends — it was being computed to group glyphs into lines
   * and then thrown away, which is why paragraphs used to run together.
   */
  y: number;
}

export interface PdfRead {
  lines: PdfLine[];
  warnings: Warning[];
}

/**
 * Extracts the text layer from a PDF.
 *
 * pdfjs wants its own worker. Recast is already inside one, so this spawns a
 * nested worker — which keeps a malformed PDF from wedging the conversion
 * worker itself. The file is served from Recast's own origin; fetching it from a
 * CDN, as pdfjs defaults to, would break offline use and would tell a third
 * party which documents someone is opening.
 */
async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist');

  // Where nested workers exist — every browser Recast runs in — pdfjs gets its
  // own, so a malformed PDF cannot wedge the conversion worker itself. Where
  // they do not (the test runner), pdfjs falls back to parsing inline, which
  // is correct, just not isolated.
  if (typeof Worker !== 'undefined') {
    // pdf.worker.mjs sits beside this chunk, put there by build-worker.mjs.
    //
    // The path is assembled by hand rather than with `new URL(literal, ...)`
    // because bundlers treat that literal as a module to resolve — and Next,
    // which also bundles this file for the page, has no such file next to the
    // source and fails the build. Plain string maths is unambiguous, and still
    // resolves relative to whatever URL this chunk was served from.
    const here = import.meta.url;
    pdfjs.GlobalWorkerOptions.workerSrc = `${here.slice(0, here.lastIndexOf('/') + 1)}pdf.worker.mjs`;
  }

  return pdfjs;
}

export async function readPdf(input: File, onProgress?: ProgressFn): Promise<PdfRead> {
  const buffer = await readArrayBuffer(input);
  const pdfjs = await loadPdfjs();

  // Held so it can be destroyed at the end: destroy() lives on the loading
  // task, not the document, and it is what shuts down the nested worker.
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    // Recast has no business fetching anything while reading a local file.
    disableFontFace: true,
    useWorkerFetch: false,
    isEvalSupported: false,
  } as Parameters<typeof pdfjs.getDocument>[0]);

  let doc;
  try {
    doc = await loadingTask.promise;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (/password/i.test(message)) {
      fail('This PDF is password-protected. Remove the password and try again.');
    }
    fail(describeFailure(cause, 'pdf'));
  }

  const lines: PdfLine[] = [];
  const warnings: Warning[] = [];
  // Read before destroy() — the document is unusable afterwards.
  const pageCount = doc.numPages;

  // A long PDF is the conversion people actually wait on, and it is also the
  // one engine that knows exactly how far through it is. Reported before each
  // page rather than after, so the count names the page being worked on.
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    onProgress?.({ phase: 'reading', unit: 'page', done: pageNumber, total: pageCount });

    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();

    // Group glyph runs into visual lines by their baseline.
    const byBaseline = new Map<number, { text: string; size: number }>();

    for (const item of content.items) {
      if (!('str' in item) || typeof item.str !== 'string') continue;
      const str = item.str;
      if (!str) continue;

      const transform = item.transform as number[];
      const y = Math.round((transform[5] ?? 0) * 2) / 2;
      const size = Math.abs(transform[3] ?? transform[0] ?? 10);

      const existing = byBaseline.get(y);
      if (existing) {
        existing.text += str;
        existing.size = Math.max(existing.size, size);
      } else {
        byBaseline.set(y, { text: str, size });
      }
    }

    const ordered = [...byBaseline.entries()].sort((a, b) => b[0] - a[0]);
    for (const [y, line] of ordered) {
      const text = line.text.replace(/\s+/g, ' ').trim();
      if (text) lines.push({ text, size: line.size, page: pageNumber, y });
    }

    page.cleanup();
  }

  await loadingTask.destroy();

  if (lines.length === 0) {
    fail(
      "This PDF has no text in it. It's probably a scan, and Recast can't read those.",
    );
  }

  // A page or two with no text among many usually means mixed scanned inserts.
  const pagesWithText = new Set(lines.map((l) => l.page)).size;
  if (pagesWithText < pageCount) {
    warnings.push(
      lost(
        `${pageCount - pagesWithText} of ${pageCount} pages had no text to extract and came through empty — those pages are probably scans.`,
      ),
    );
  }

  return { lines, warnings };
}

/**
 * Turns extracted lines into blocks, guessing headings from type size.
 *
 * This is genuinely unreliable — a PDF records glyph positions, not structure,
 * so a large line might be a heading, a pull quote, or a page number in a
 * display face. Hence `lossy`, and hence the caveat shown before conversion.
 */
export function pdfLinesToBlocks(lines: PdfLine[]): Block[] {
  const sizes = lines.map((l) => l.size).sort((a, b) => a - b);
  const body = sizes[Math.floor(sizes.length / 2)] ?? 10;

  // Sizes are ranked rather than measured against fixed ratios, for the same
  // reason the RTF reader ranks them: a ratio has to pick a number, and ×1.5
  // put a 17pt heading over 11pt body — Recast's own `##` — into h1. The largest
  // size in the document is h1, whatever it is.
  const levels = [
    ...new Set(lines.map((l) => round(l.size)).filter((size) => size > round(body))),
  ].sort((a, b) => b - a);
  const levelOf = (size: number) => Math.min(levels.indexOf(round(size)) + 1, 6);

  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
      paragraph = [];
    }
  };

  for (const [index, line] of lines.entries()) {
    const previous = lines[index - 1];

    // A gap much wider than the line's own height is where a paragraph ended.
    // Sentence punctuation alone used to decide this, so a paragraph not
    // ending in a full stop ran straight into the next one.
    //
    // Measured against the line's own size rather than a document-wide median:
    // the median is dragged upwards by the big gaps around headings, and in a
    // document of one-line paragraphs every gap is a paragraph gap, so there is
    // no "normal" for it to represent. Ordinary leading is about 1.2 to 1.5
    // times the type size; a paragraph break is over 2.
    const brokeAway =
      previous !== undefined &&
      (previous.page !== line.page || previous.y - line.y > line.size * 1.8);
    if (brokeAway) flush();

    if (round(line.size) > round(body)) {
      flush();
      blocks.push({ kind: 'heading', level: levelOf(line.size), text: line.text });
    } else if (/^\s*[•·\-*]\s+/.test(line.text)) {
      flush();
      blocks.push({
        kind: 'bullet',
        ordered: false,
        depth: 0,
        text: line.text.replace(/^\s*[•·\-*]\s+/, ''),
      });
    } else if (/^\s*\d+[.)]\s+/.test(line.text)) {
      flush();
      blocks.push({
        kind: 'bullet',
        ordered: true,
        depth: 0,
        text: line.text.replace(/^\s*\d+[.)]\s+/, ''),
      });
    } else {
      paragraph.push(line.text);
      // Still useful as a second signal, for a document whose spacing is flat.
      if (/[.!?:]["')\]]?$/.test(line.text)) flush();
    }
  }

  flush();
  return blocks;
}

/** Sizes come back with floating-point noise; a quarter-point is the real grain. */
function round(size: number): number {
  return Math.round(size * 4) / 4;
}
