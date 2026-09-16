import type { Format } from '@/lib/registry/types';

/**
 * Whether a file is likely to be more than this browser can hold.
 *
 * Kiln holds the whole document in memory — the file, the parsed tree, and the
 * output, all at once — and a browser that runs out does not throw. On iOS the
 * tab is killed outright, with no error to catch and nothing to report, so the
 * page simply disappears. That is the failure this module exists to get ahead
 * of: it is better to say "this may not work, and here is what to try" before
 * the conversion than to vanish in the middle of one.
 *
 * Everything here is a **prediction, not a measurement**. The thresholds are
 * provisional and deliberately cautious; a warning does not stop the conversion.
 */

/**
 * Peak working memory as a multiple of the document's size, **per pair**.
 *
 * Keyed on the pair, not the source format. Keyed on the source it had to carry
 * the worst target's figure, so `md → txt` was judged by `md → pdf`'s ×145 and
 * warned about files it handles in a few megabytes — the same cry-wolf problem
 * that multiplying a compressed archive's size caused, arriving by a different
 * door. The registry is pair-keyed and the measurements were per pair; this
 * table now matches both.
 *
 * Measured by sampling the heap through real conversions of multi-megabyte
 * inputs, worst of two runs, rounded up for headroom. They are
 * order-of-magnitude figures: the real number depends on what is in the
 * document, and the estimate built on them is a prediction, never a
 * measurement.
 *
 * "Size" means the bytes an engine actually works on. For the zip formats that
 * is the unpacked size, which `sniffOoxml` reads out of the archive while
 * identifying it — see `ZIP_RATIO` for when the headers did not say.
 */
export const FOOTPRINT: Record<string, number> = {
  // Text documents
  'docx>md': 85, // measured ×70
  'docx>txt': 80, // ×64
  'docx>pdf': 220, // ×186 — pdfmake lays out every line before writing
  'docx>rtf': 95, // ×77
  'md>docx': 100, // ×82
  'md>pdf': 175, // ×145
  'md>txt': 35, // ×26
  'md>pptx': 95, // ×79
  'txt>md': 15, // ×9
  'txt>docx': 25, // ×18
  'txt>pdf': 50, // ×38
  'rtf>txt': 20, // ×12
  'rtf>md': 20, // ×15
  'pdf>txt': 90, // ×74 — pdfjs holds the page tree and the text layer
  'pdf>md': 60, // ×46

  // Spreadsheets
  'xlsx>csv': 20, // ×12
  'xlsx>md': 20, // ×12
  'xlsx>txt': 20, // ×14
  'xlsx>pdf': 60, // ×47
  'xlsx>docx': 220, // ×181 — a Word table object per cell
  'csv>xlsx': 275, // ×227 — see the note below
  'csv>md': 30, // ×23
  'csv>txt': 15, // ×9

  // Slides
  'pptx>txt': 10, // ×5
  'pptx>md': 10, // ×5
};

/**
 * The two heaviest pairs, and why they stay that way.
 *
 * `csv → xlsx` at ×227 is SheetJS: `aoa_to_sheet` builds one cell object per
 * value, and `XLSX.write` then materialises the whole workbook XML before it
 * zips anything — 270 MB from a 1.2 MB file, of which about 35 MB is the sheet
 * and the rest is the writer. There is no streaming write in the build Kiln
 * ships. The one part Kiln controlled was holding the parsed rows alive
 * alongside the sheet, which it no longer does; that was worth about 10%.
 *
 * `md → pdf` at ×145 is pdfmake, which builds a document tree, lays out every
 * line, and holds the result until the file is serialised. Kiln's own step —
 * blocks to content nodes — is a few megabytes of the sixty-six.
 *
 * Both are the library's shape rather than a mistake in Kiln, so the numbers
 * are facts to predict with, not bugs to fix.
 */

/** Formats whose FOOTPRINT is against unpacked, not compressed, bytes. */
const PACKED: ReadonlySet<Format> = new Set<Format>(['docx', 'xlsx', 'pptx']);

/**
 * What to assume an archive unpacks to when its headers did not say.
 *
 * Deliberately modest: over-guessing here warns about files that are mostly
 * images, which barely expand at all.
 */
const ZIP_RATIO = 8;

/** The multiplier for one pair, or a cautious default for a pair not measured. */
export function footprintFor(from: Format, to: Format): number {
  return FOOTPRINT[`${from}>${to}`] ?? 100;
}

export interface Capacity {
  /** Bytes of working memory Kiln is willing to assume it can use. */
  budget: number;
  /** True on iOS, where every browser is WebKit and the tab dies without a word. */
  webkitMobile: boolean;
  /** Where `budget` came from, so the warning can be honest about it. */
  basis: 'heap' | 'deviceMemory' | 'ios' | 'assumed';
}

/** Chromium exposes this; nothing else does. */
interface HeapInfo {
  jsHeapSizeLimit: number;
  usedJSHeapSize: number;
}

const MB = 1024 * 1024;

/**
 * iOS, whatever the browser says it is.
 *
 * Every iOS browser is WebKit underneath and inherits the same per-tab memory
 * ceiling, so Chrome on an iPhone is no safer than Safari. iPadOS reports itself
 * as a Mac, which the touch-point check catches.
 */
function isWebkitMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return (
    /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  );
}

export function capacity(): Capacity {
  const webkitMobile = isWebkitMobile();

  // Where the platform will tell us, ask it. Guarded for the prerender, which
  // has neither global — no job row exists there, but a crash would be silent.
  const heap =
    typeof performance === 'undefined'
      ? undefined
      : (performance as Performance & { memory?: HeapInfo }).memory;
  if (heap?.jsHeapSizeLimit) {
    return {
      budget: Math.max(0, heap.jsHeapSizeLimit - heap.usedJSHeapSize) * 0.6,
      webkitMobile,
      basis: 'heap',
    };
  }

  const deviceMemory =
    typeof navigator === 'undefined'
      ? undefined
      : (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (deviceMemory) {
    // deviceMemory is total RAM in GB, capped at 8. A tab gets a fraction of it.
    return {
      budget: deviceMemory * 1024 * MB * 0.25,
      webkitMobile,
      basis: 'deviceMemory',
    };
  }

  // Safari exposes neither. These are guesses, and the iOS one is the tightest
  // environment Kiln meets: a tab that overreaches is killed, not throttled.
  // Provisional until someone measures a real device.
  if (webkitMobile) return { budget: 350 * MB, webkitMobile, basis: 'ios' };
  return { budget: 1024 * MB, webkitMobile, basis: 'assumed' };
}

/** Rounded for a sentence: 1.5 GB rather than 1536 MB. */
function readableSize(bytes: number): string {
  const mb = bytes / MB;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

export interface CautionOptions {
  /** An archive's unpacked size, from `sniffOoxml`. */
  expandedSize?: number;
  limits?: Capacity;
}

export interface SizeCaution {
  estimate: number;
  budget: number;
  message: string;
}

/**
 * The caution to show before a conversion starts, or `undefined` when the file
 * is comfortably within reach.
 *
 * Shown while the job is still queued. It never blocks the conversion — the
 * estimate is far too rough to refuse work on, and a person who knows their own
 * machine should be able to ignore it.
 */
export function sizeCaution(
  file: File,
  from: Format,
  to: Format,
  { expandedSize, limits = capacity() }: CautionOptions = {},
): SizeCaution | undefined {
  const content = PACKED.has(from) ? (expandedSize ?? file.size * ZIP_RATIO) : file.size;
  const estimate = content * footprintFor(from, to);
  if (estimate <= limits.budget) return undefined;

  const where = limits.webkitMobile
    ? 'an iPhone or iPad gives a tab far less than that, and iOS closes one that runs out without an error'
    : `this browser looks able to spare about ${readableSize(limits.budget)}`;

  return {
    estimate,
    budget: limits.budget,
    message:
      `This file may be too large for this browser. Turning a ` +
      `${readableSize(file.size)} .${from} into a .${to} can need around ` +
      `${readableSize(estimate)} of memory, and ` +
      `${where}. That is an estimate from the file size rather than a measurement, ` +
      `so it may work anyway — but if the page stops responding or closes, this is ` +
      `why. A desktop browser, or a smaller file, is the way around it.`,
  };
}
