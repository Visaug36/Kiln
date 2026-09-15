import { describeFailure, fail, readArrayBuffer } from '../shared';
import type { Block } from './_md';

export interface PdfLine {
  text: string;
  /** Transformed glyph height, used to guess headings. */
  size: number;
  page: number;
}

export interface PdfRead {
  lines: PdfLine[];
  warnings: string[];
}

/**
 * Extracts the text layer from a PDF.
 *
 * pdfjs wants its own worker. Kiln is already inside one, so this spawns a
 * nested worker — which keeps a malformed PDF from wedging the conversion
 * worker itself. The file is served from Kiln's own origin; fetching it from a
 * CDN, as pdfjs defaults to, would break offline use and would tell a third
 * party which documents someone is opening.
 */
async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist');

  // Where nested workers exist — every browser Kiln runs in — pdfjs gets its
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

export async function readPdf(input: File): Promise<PdfRead> {
  const buffer = await readArrayBuffer(input);
  const pdfjs = await loadPdfjs();

  // Held so it can be destroyed at the end: destroy() lives on the loading
  // task, not the document, and it is what shuts down the nested worker.
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    // Kiln has no business fetching anything while reading a local file.
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
  const warnings: string[] = [];
  // Read before destroy() — the document is unusable afterwards.
  const pageCount = doc.numPages;

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
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
    for (const [, line] of ordered) {
      const text = line.text.replace(/\s+/g, ' ').trim();
      if (text) lines.push({ text, size: line.size, page: pageNumber });
    }

    page.cleanup();
  }

  await loadingTask.destroy();

  if (lines.length === 0) {
    fail("This PDF has no text in it. It's probably a scan, and Kiln can't read those.");
  }

  // A page or two with no text among many usually means mixed scanned inserts.
  const pagesWithText = new Set(lines.map((l) => l.page)).size;
  if (pagesWithText < pageCount) {
    warnings.push(
      `${pageCount - pagesWithText} of ${pageCount} pages had no text to extract and came through empty — those pages are probably scans.`,
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

  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
      paragraph = [];
    }
  };

  for (const line of lines) {
    if (line.size >= body * 1.5) {
      flush();
      blocks.push({ kind: 'heading', level: 1, text: line.text });
    } else if (line.size >= body * 1.22) {
      flush();
      blocks.push({ kind: 'heading', level: 2, text: line.text });
    } else if (/^\s*[•·\-*]\s+/.test(line.text)) {
      flush();
      blocks.push({
        kind: 'bullet',
        ordered: false,
        text: line.text.replace(/^\s*[•·\-*]\s+/, ''),
      });
    } else {
      paragraph.push(line.text);
      // A line ending in sentence punctuation usually ends the paragraph.
      if (/[.!?:]["')\]]?$/.test(line.text)) flush();
    }
  }

  flush();
  return blocks;
}
