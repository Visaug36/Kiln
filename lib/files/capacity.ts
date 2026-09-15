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
 * Peak working memory as a multiple of the document's size, by source format.
 * The worst declared target for that format, rounded up.
 *
 * Measured by sampling the heap through real conversions of multi-megabyte
 * inputs. They are order-of-magnitude figures, not constants — the real number
 * depends on what is in the document — and the estimate built on them is a
 * prediction, never a measurement.
 *
 * "Size" here means the bytes an engine actually works on. For the zip formats
 * that is the unpacked size, which `sniffOoxml` reads out of the archive while
 * identifying it. Multiplying the *compressed* size instead is hopeless in both
 * directions: OOXML text compresses by ten to a hundred times, so it cries wolf
 * over a small text-heavy document and stays silent about a large one full of
 * already-compressed images. `ZIP_RATIO` is the fallback for when the zip
 * headers did not record it.
 */
export const FOOTPRINT: Record<Format, number> = {
  txt: 20, // measured ×8–17
  rtf: 15, // measured ×12–13
  md: 200, // measured ×79–195 (md → pdf is the worst)
  csv: 250, // measured ×8–246 (csv → xlsx is the worst)
  pdf: 70, // measured ×28–70
  docx: 120, // measured ×50–165 of unpacked size (docx → txt is the worst)
  xlsx: 30, // measured ×25 of unpacked size (xlsx → docx is the worst)
  pptx: 5, // measured ×2–3 of unpacked size
};

/** Formats whose FOOTPRINT is against unpacked, not compressed, bytes. */
const PACKED: ReadonlySet<Format> = new Set<Format>(['docx', 'xlsx', 'pptx']);

/**
 * What to assume an archive unpacks to when its headers did not say.
 *
 * Deliberately modest: over-guessing here warns about files that are mostly
 * images, which barely expand at all.
 */
const ZIP_RATIO = 8;

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
  { expandedSize, limits = capacity() }: CautionOptions = {},
): SizeCaution | undefined {
  const content = PACKED.has(from) ? (expandedSize ?? file.size * ZIP_RATIO) : file.size;
  const estimate = content * FOOTPRINT[from];
  if (estimate <= limits.budget) return undefined;

  const where = limits.webkitMobile
    ? 'an iPhone or iPad gives a tab far less than that, and iOS closes one that runs out without an error'
    : `this browser looks able to spare about ${readableSize(limits.budget)}`;

  return {
    estimate,
    budget: limits.budget,
    message:
      `This file may be too large for this browser. A ${readableSize(file.size)} ` +
      `.${from} can need around ${readableSize(estimate)} of memory to convert, and ` +
      `${where}. That is an estimate from the file size rather than a measurement, ` +
      `so it may work anyway — but if the page stops responding or closes, this is ` +
      `why. A desktop browser, or a smaller file, is the way around it.`,
  };
}
