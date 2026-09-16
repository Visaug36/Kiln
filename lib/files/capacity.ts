import { find } from '@/lib/registry/routing';
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
 * What one declared converter costs.
 *
 * `peak` is peak working memory as a multiple of the content it is given.
 * `growth` is how much bigger the file it writes is than the content it read —
 * which only matters because most pairs Kiln offers are two converters run back
 * to back, and the second one is handed the first one's output.
 *
 * Keyed on the **edge**, not the pair. There are around a hundred pairs and
 * thirty-nine edges, so measuring pairs would be a hundred numbers drifting out
 * of step with each other and with the engines beneath them. A route's cost is
 * composed from its edges in `footprintFor`, the same way the conversion itself
 * is composed.
 *
 * Measured by sampling the heap through real conversions of multi-megabyte
 * documents, worst of two runs, rounded up for headroom — see
 * `test/measure-memory.test.ts`, which prints this table. They are
 * order-of-magnitude figures: the real number depends on what is in the
 * document, and the estimate built on them is a prediction, never a
 * measurement.
 *
 * "Content" means the bytes an engine actually works on. For the zip formats
 * that is the unpacked size, which `sniffOoxml` reads out of the archive while
 * identifying it — see `ZIP_RATIO` for when the headers did not say.
 */
export interface EdgeCost {
  peak: number;
  growth: number;
}

export const EDGE_COST: Record<string, EdgeCost> = {
  // Text documents
  'docx>md': { peak: 100, growth: 0.11 }, // ×80
  'docx>txt': { peak: 100, growth: 0.09 }, // ×80
  'docx>pdf': { peak: 100, growth: 0.31 }, // ×80 — pdfmake lays out every line before writing
  'docx>rtf': { peak: 125, growth: 0.2 }, // ×100
  'odt>md': { peak: 30, growth: 0.17 }, // ×24
  'html>md': { peak: 10, growth: 0.01 }, // ×5
  'epub>md': { peak: 15, growth: 0.3 }, // ×12
  'rtf>txt': { peak: 20, growth: 0.42 }, // ×16
  'rtf>md': { peak: 25, growth: 0.42 }, // ×19
  'pdf>txt': { peak: 40, growth: 0.27 }, // ×30
  'pdf>md': { peak: 65, growth: 0.28 }, // ×53
  'md>docx': { peak: 475, growth: 0.06 }, // ×393 — the docx library builds a paragraph object per block
  'md>odt': { peak: 80, growth: 0.04 }, // ×65
  'md>pdf': { peak: 190, growth: 2.68 }, // ×155
  'md>rtf': { peak: 75, growth: 1.8 }, // ×62
  'md>html': { peak: 65, growth: 1.85 }, // ×51
  'md>epub': { peak: 95, growth: 1.81 }, // ×78
  'md>txt': { peak: 25, growth: 0.85 }, // ×21
  'txt>md': { peak: 5, growth: 1.0 }, // ×1
  'txt>docx': { peak: 120, growth: 0.02 }, // ×100
  'txt>pdf': { peak: 165, growth: 1.51 }, // ×136

  // Spreadsheets
  'xlsx>csv': { peak: 15, growth: 0.18 }, // ×10
  'xlsx>ods': { peak: 135, growth: 3.26 }, // ×112
  'xlsx>json': { peak: 15, growth: 0.75 }, // ×12
  'xlsx>md': { peak: 15, growth: 0.24 }, // ×12
  'xlsx>txt': { peak: 15, growth: 0.17 }, // ×10
  'xlsx>pdf': { peak: 80, growth: 0.65 }, // ×65
  'xlsx>docx': { peak: 220, growth: 0.03 }, // ×183 — a Word table object per cell
  'ods>xlsx': { peak: 15, growth: 0.39 }, // ×12
  'ods>csv': { peak: 10, growth: 0.05 }, // ×5
  'ods>md': { peak: 10, growth: 0.08 }, // ×6
  'ods>txt': { peak: 10, growth: 0.05 }, // ×5
  'ods>pdf': { peak: 25, growth: 0.2 }, // ×20
  'ods>docx': { peak: 70, growth: 0.01 }, // ×55
  // The heaviest edge Kiln has, and the library's shape rather than a mistake:
  // SheetJS builds a cell object per value and then materialises the whole
  // workbook XML as one string before zipping any of it, with no streaming
  // write in the build Kiln ships. Releasing the parsed rows the moment the
  // sheet holds them was the one part Kiln controlled, and it already does.
  'csv>xlsx': { peak: 310, growth: 5.95 }, // ×257
  'csv>md': { peak: 45, growth: 1.46 }, // ×36
  'csv>txt': { peak: 5, growth: 1.0 }, // ×1
  'json>xlsx': { peak: 145, growth: 2.18 }, // ×117

  // Slides
  'pptx>txt': { peak: 5, growth: 0.03 }, // ×1 — an unpacked deck is mostly theme and media XML, so the text is a sliver of it
  'pptx>md': { peak: 5, growth: 0.03 }, // ×1
  'odp>txt': { peak: 10, growth: 0.12 }, // ×5
  'odp>md': { peak: 10, growth: 0.13 }, // ×6
  'md>pptx': { peak: 320, growth: 31.13 }, // ×264 — a slide object per heading, and the deck is written whole
  'md>odp': { peak: 105, growth: 0.04 }, // ×83
};

/** A cautious default for an edge nobody has measured yet. */
const UNMEASURED: EdgeCost = { peak: 100, growth: 1 };

/**
 * The multiplier for one pair, however Kiln reaches it.
 *
 * Two converters run one after the other, so the peak is the larger of their
 * two peaks — not their sum. The second one's peak is scaled by how much the
 * first one grew the file, because that is what it is handed: `csv → ods` goes
 * through Excel, and costs what `xlsx → ods` costs *on the workbook that was
 * just written* — six times the CSV — not on the CSV.
 *
 * An unmeasured edge falls back to a cautious default rather than to nothing;
 * `capacity.test.ts` fails if any declared edge is actually missing, so the
 * fallback is for a table that has drifted, not for one that is incomplete.
 */
export function footprintFor(from: Format, to: Format): number {
  const route = find(from, to);
  if (!route) return UNMEASURED.peak;

  let worst = 0;
  let scale = 1;

  for (const step of route.steps) {
    const cost = EDGE_COST[`${step.from}>${step.to}`] ?? UNMEASURED;
    worst = Math.max(worst, scale * cost.peak);
    scale *= cost.growth;
  }

  return Math.round(worst);
}

/** Formats whose cost is measured against unpacked, not compressed, bytes. */
const PACKED: ReadonlySet<Format> = new Set<Format>([
  'docx',
  'xlsx',
  'pptx',
  'odt',
  'ods',
  'odp',
  'epub',
]);

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
