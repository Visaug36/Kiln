import { fail } from '../shared';

/**
 * pdfmake with the PDF base-14 fonts.
 *
 * The alternative, pdfmake's bundled Roboto, is an 836 KB virtual file system
 * of embedded font binaries. Helvetica needs only its AFM metrics because every
 * PDF reader already has the face, so the engine chunk stays a fraction of the
 * size and the output is still real, selectable, searchable text — which a
 * canvas screenshot would not be.
 */
export type PdfContent = Record<string, unknown> | Array<Record<string, unknown>>;

export interface PdfDoc {
  content: unknown[];
  [key: string]: unknown;
}

let ready: Promise<typeof import('pdfmake/build/pdfmake').default> | null = null;

async function pdfmake() {
  if (!ready) {
    ready = (async () => {
      const [{ default: pdfMake }, { default: helvetica }] = await Promise.all([
        import('pdfmake/build/pdfmake'),
        import('pdfmake/build/standard-fonts/Helvetica'),
      ]);

      // The container is `{ vfs, fonts }`. addVirtualFileSystem walks the map it
      // is handed, so it needs the vfs itself — handing it the whole container
      // makes it try to write "vfs" and "fonts" as if they were font files.
      pdfMake.addVirtualFileSystem(helvetica.vfs);
      pdfMake.addFonts(helvetica.fonts);
      return pdfMake;
    })();
  }
  return ready;
}

/** Page setup and type scale shared by every PDF Kiln writes. */
export function pdfDocument(
  content: unknown[],
  extra: Record<string, unknown> = {},
): PdfDoc {
  return {
    content,
    defaultStyle: { font: 'Helvetica', fontSize: 11, lineHeight: 1.35 },
    pageSize: 'A4',
    pageMargins: [56, 56, 56, 56],
    styles: {
      h1: { fontSize: 22, bold: true, margin: [0, 14, 0, 8] },
      h2: { fontSize: 17, bold: true, margin: [0, 12, 0, 6] },
      h3: { fontSize: 14, bold: true, margin: [0, 10, 0, 5] },
      h4: { fontSize: 12, bold: true, margin: [0, 9, 0, 4] },
      code: { font: 'Helvetica', fontSize: 10, color: '#444444' },
      quote: { italics: true, color: '#555555', margin: [12, 4, 0, 4] },
      th: { bold: true, fontSize: 10 },
      td: { fontSize: 10 },
    },
    ...extra,
  };
}

export async function renderPdf(doc: PdfDoc): Promise<Uint8Array> {
  const pdfMake = await pdfmake();
  // pdfmake 0.3 returns a promise here; the callback form was 0.2's.
  return new Uint8Array(await pdfMake.createPdf(doc).getBuffer());
}

/** Guards against handing pdfmake an empty document, which it rejects. */
export function requireContent(content: unknown[], what: string): unknown[] {
  if (content.length === 0) {
    fail(`There was no ${what} to put in the PDF.`);
  }
  return content;
}
