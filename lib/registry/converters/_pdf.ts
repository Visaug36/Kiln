import { fail } from '../shared';
import { loadFace, variantFor, type LoadedFace } from './_cjk';

/**
 * pdfmake with its bundled Roboto, embedded in the file.
 *
 * Kiln used the base-14 Helvetica before, which costs nothing to ship because
 * every PDF reader already has the face. But a base-14 font is addressed with a
 * single-byte encoding roughly the size of Latin-1, so anything above U+00FF had
 * nowhere to render from: `Καλημέρα` came out as `9£±;³·;Ã-<`, and the
 * conversion reported success. Roboto is embedded, so the glyphs travel with the
 * document.
 *
 * Roboto covers Latin, Greek and Cyrillic — 927 code points, identical across
 * all four styles. Everything else it cannot draw, which is what COVERAGE below
 * is for.
 */
export type PdfContent = Record<string, unknown> | Array<Record<string, unknown>>;

export interface PdfDoc {
  content: unknown[];
  [key: string]: unknown;
}

export interface PdfRender {
  bytes: Uint8Array;
  /** Populated when characters had to be replaced to be written at all. */
  warnings: string[];
}

let ready: Promise<typeof import('pdfmake/build/pdfmake').default> | null = null;

async function pdfmake() {
  if (!ready) {
    ready = (async () => {
      const [{ default: pdfMake }, { default: roboto }] = await Promise.all([
        import('pdfmake/build/pdfmake'),
        import('pdfmake/build/fonts/Roboto'),
      ]);

      // The container is `{ vfs, fonts }`. addVirtualFileSystem walks the map it
      // is handed, so it needs the vfs itself — handing it the whole container
      // makes it try to write "vfs" and "fonts" as if they were font files.
      pdfMake.addVirtualFileSystem(roboto.vfs);
      pdfMake.addFonts(roboto.fonts);
      return pdfMake;
    })();
  }
  return ready;
}

/**
 * Every code point Roboto can draw, as `start-end` ranges in hex.
 *
 * Derived from the font Kiln actually ships rather than from the Unicode blocks
 * it looks like it covers — guessing here would put the silent-mojibake bug
 * straight back. Regenerate with fontTools if pdfmake's Roboto ever changes:
 *
 *   python3 -c "from fontTools.ttLib import TTFont; \
 *     f=TTFont('node_modules/pdfmake/build/fonts/Roboto/Roboto-Regular.ttf'); \
 *     print(sorted({c for t in f['cmap'].tables for c in t.cmap}))"
 */
const COVERAGE =
  '0,2,d,20-7e,a0-17f,18f,192,1a0-1a1,1af-1b0,1f0,1fa-1ff,218-21b,237,259,2bc,' +
  '2c6-2c7,2c9,2d8-2dd,2f3,300-301,303,309,30f,323,384-38a,38c,38e-3a1,3a3-3ce,' +
  '3d1-3d2,3d6,400-486,488-513,1e00-1e01,1e3e-1e3f,1e80-1e85,1e9e,1ea0-1ef9,1f4d,' +
  '2000-200b,2010-2011,2013-2015,2017-201e,2020-2022,2025-2027,2030,2032-2033,' +
  '2039-203a,203c,2044,2070,2074-208e,20a3-20a4,20a6-20ac,20b1,20b9-20ba,20bc-20bd,' +
  '20c1,2105,2113,2116,2122,2126,212e,215b-215e,2202,2206,220f,2211-2212,221a,221e,' +
  '222b,2248,2260,2264-2265,25a0,25ca-25cb,25cf,ee01-ee02,f6c3,fb01-fb04,feff,fffc-fffd';

const RANGES: [number, number][] = COVERAGE.split(',').map((part) => {
  const [from, to] = part.split('-');
  const start = parseInt(from!, 16);
  return [start, to ? parseInt(to, 16) : start];
});

function canDraw(code: number): boolean {
  let low = 0;
  let high = RANGES.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const [start, end] = RANGES[mid]!;
    if (code < start) high = mid - 1;
    else if (code > end) low = mid + 1;
    else return true;
  }
  return false;
}

/**
 * What to call a script in a sentence, for the characters Roboto has none of.
 *
 * Deliberately coarse. `日本語` spans CJK Unified Ideographs and Hiragana, and a
 * warning naming both "Chinese or Japanese" and "Japanese" tells the reader
 * nothing they can act on — one label per writing system is the useful grain.
 *
 * Korean is separate from the other two because Kiln now draws Chinese and
 * Japanese and does not draw Korean: neither face carries a single hangul
 * syllable, so a Korean document is still refused, and the sentence has to say
 * Korean rather than lumping it in with two scripts that work.
 */
const SCRIPTS: [number, number, string][] = [
  [0x0590, 0x05ff, 'Hebrew'],
  [0x0600, 0x06ff, 'Arabic'],
  [0x0700, 0x074f, 'Syriac'],
  [0x0750, 0x077f, 'Arabic'],
  [0x0780, 0x07bf, 'Thaana'],
  [0x0900, 0x097f, 'Devanagari'],
  [0x0980, 0x0dff, 'Indic'],
  [0x0e00, 0x0e7f, 'Thai'],
  [0x0e80, 0x0eff, 'Lao'],
  [0x1000, 0x109f, 'Burmese'],
  [0x10a0, 0x10ff, 'Georgian'],
  [0x1100, 0x11ff, 'Korean'],
  [0x1200, 0x137f, 'Ethiopic'],
  [0x1780, 0x17ff, 'Khmer'],
  // Roboto has the Vietnamese block in full, but only part of the rest of
  // Latin Extended Additional — the dot-below and macron-below letters used by
  // Yoruba and by Sanskrit transliteration are missing.
  [0x1e00, 0x1eff, 'Latin letters with less common accents'],
  [0x1f00, 0x1fff, 'polytonic Greek'],
  [0x2600, 0x27bf, 'emoji'],
  [0x2e80, 0x9fff, 'Chinese or Japanese'],
  [0xa000, 0xa4cf, 'Yi'],
  [0xac00, 0xd7af, 'Korean'],
  [0xf900, 0xfaff, 'Chinese or Japanese'],
  [0xfb50, 0xfdff, 'Arabic'],
  [0xfe70, 0xfeff, 'Arabic'],
  [0xff00, 0xffef, 'Chinese or Japanese'],
  [0x1f000, 0x1faff, 'emoji'],
];

function scriptOf(code: number): string {
  for (const [start, end, name] of SCRIPTS) {
    if (code >= start && code <= end) return name;
  }
  return 'some rarer letters';
}

/** What replaces a character the font cannot draw. Roboto does have U+FFFD. */
const REPLACEMENT = '�';

interface Scan {
  kept: number;
  dropped: number;
  scripts: Set<string>;
  /** CJK code points seen, so the right face can be chosen before the rewrite. */
  cjk: number[];
}

/** One stretch of text in one font. pdfmake takes an array of these as `text`. */
interface Run {
  text: string;
  font?: string;
}

/** True for a character a CJK face would be expected to carry. */
function isCjk(code: number): boolean {
  return scriptOf(code) === 'Chinese or Japanese';
}

/**
 * Splits a string into runs by the font each character needs.
 *
 * Returns a plain string when one font covers the whole thing, which is almost
 * always, so the document stays simple. A CJK face carries Latin but not Greek,
 * Cyrillic or Latin Extended, and Roboto carries those but no CJK — a document
 * with both needs the two fonts side by side rather than a choice between them.
 */
function sanitizeText(text: string, scan: Scan, face?: LoadedFace): string | Run[] {
  const runs: Run[] = [];

  const push = (piece: string, font?: string) => {
    const last = runs[runs.length - 1];
    if (last && last.font === font) last.text += piece;
    else runs.push({ text: piece, font });
  };

  for (const character of text) {
    const code = character.codePointAt(0)!;
    const letter = /\p{L}/u.test(character);

    if (canDraw(code)) {
      if (letter) scan.kept += 1;
      push(character);
      continue;
    }

    if (face && face.covers.has(code)) {
      if (letter) scan.kept += 1;
      push(character, face.font);
      continue;
    }

    if (isCjk(code)) scan.cjk.push(code);

    if (letter || /\p{Emoji_Presentation}|\p{S}/u.test(character)) {
      scan.dropped += 1;
      scan.scripts.add(scriptOf(code));
    }
    push(REPLACEMENT);
  }

  if (runs.length === 0) return '';
  if (runs.length === 1 && !runs[0]!.font) return runs[0]!.text;
  return runs;
}

/**
 * Replaces every character the embedded font cannot draw, anywhere in the
 * content.
 *
 * Walks the whole content tree rather than each engine's own text, so a
 * converter cannot forget to ask — which is the only reason the four PDF pairs
 * are guaranteed to behave the same way.
 */
function sanitizeTree(value: unknown, scan: Scan, face?: LoadedFace): unknown {
  if (typeof value === 'string') return sanitizeText(value, scan, face);
  if (Array.isArray(value)) return value.map((item) => sanitizeTree(item, scan, face));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      out[key] = sanitizeTree(inner, scan, face);
    }
    return out;
  }
  return value;
}

/** "Arabic and Hebrew", for a sentence. */
function listScripts(scripts: Set<string>): string {
  const names = [...scripts].sort();
  if (names.length === 1) return names[0]!;

  const last = names[names.length - 1]!;
  const rest = names.slice(0, -1);
  // "Chinese, Japanese or Korean" already has commas in it, so a comma-separated
  // list of names reads as one long run of alternatives. Step up to semicolons.
  return names.some((name) => name.includes(','))
    ? `${rest.join('; ')}; and ${last}`
    : `${rest.join(', ')} and ${last}`;
}

/** Page setup and type scale shared by every PDF Kiln writes. */
export function pdfDocument(
  content: unknown[],
  extra: Record<string, unknown> = {},
): PdfDoc {
  return {
    content,
    defaultStyle: { font: 'Roboto', fontSize: 11, lineHeight: 1.35 },
    pageSize: 'A4',
    pageMargins: [56, 56, 56, 56],
    styles: {
      h1: { fontSize: 22, bold: true, margin: [0, 14, 0, 8] },
      h2: { fontSize: 17, bold: true, margin: [0, 12, 0, 6] },
      h3: { fontSize: 14, bold: true, margin: [0, 10, 0, 5] },
      h4: { fontSize: 12, bold: true, margin: [0, 9, 0, 4] },
      code: { font: 'Roboto', fontSize: 10, color: '#444444' },
      quote: { italics: true, color: '#555555', margin: [12, 4, 0, 4] },
      th: { bold: true, fontSize: 10 },
      td: { fontSize: 10 },
    },
    ...extra,
  };
}

export async function renderPdf(doc: PdfDoc): Promise<PdfRender> {
  const fresh = (): Scan => ({ kept: 0, dropped: 0, scripts: new Set(), cjk: [] });

  // Only `content` is scanned. The rest of the definition is pdfmake's own
  // configuration — style names, colours, the font family — and counting its
  // Latin letters as document text would stop a page of Japanese from ever
  // looking unrenderable.
  let scan = fresh();
  let safe: PdfDoc = { ...doc, content: sanitizeTree(doc.content, scan) as unknown[] };

  // A first pass says whether there is CJK in here at all. Only then is a face
  // fetched — two and a half megabytes nobody else pays for — and the content
  // rewritten with it, so those characters become glyphs rather than warnings.
  let face: LoadedFace | undefined;
  if (scan.cjk.length > 0) {
    face = await loadFace(variantFor(scan.cjk)).catch(() => undefined);
    if (face) {
      scan = fresh();
      safe = { ...doc, content: sanitizeTree(doc.content, scan, face) as unknown[] };
    }
  }

  // A document Kiln could only render as a page of replacement characters is
  // not a conversion. Say what it is and where the text would survive.
  if (scan.kept === 0 && scan.dropped > 0) {
    fail(
      `This document is written in ${listScripts(scan.scripts)}, which Kiln cannot draw in a PDF. Converting it to Markdown or plain text keeps every character.`,
    );
  }

  const pdfMake = await pdfmake();
  if (face) {
    // Raw bytes, not base64: the virtual file system stores anything that is
    // not a string as it is, and base64 would cost a third again for nothing.
    pdfMake.addVirtualFileSystem({ [`${face.font}.ttf`]: { data: face.bytes } });
    pdfMake.addFonts({
      [face.font]: {
        normal: `${face.font}.ttf`,
        bold: `${face.font}.ttf`,
        italics: `${face.font}.ttf`,
        bolditalics: `${face.font}.ttf`,
      },
    });
  }

  // pdfmake 0.3 returns a promise here; the callback form was 0.2's.
  const bytes = new Uint8Array(await pdfMake.createPdf(safe).getBuffer());

  const warnings =
    scan.dropped > 0
      ? [
          `${listScripts(scan.scripts)} cannot be drawn with the font Kiln embeds, so ${scan.dropped} character${scan.dropped === 1 ? ' was' : 's were'} replaced with “${REPLACEMENT}”. Converting to Markdown or plain text keeps them.`,
        ]
      : [];

  return { bytes, warnings };
}

/** Guards against handing pdfmake an empty document, which it rejects. */
export function requireContent(content: unknown[], what: string): unknown[] {
  if (content.length === 0) {
    fail(`There was no ${what} to put in the PDF.`);
  }
  return content;
}
