/** Every document format Recast knows how to read or write. */
export type Format =
  | 'pdf'
  | 'docx'
  | 'odt'
  | 'rtf'
  | 'html'
  | 'epub'
  | 'md'
  | 'txt'
  | 'pptx'
  | 'odp'
  | 'xlsx'
  | 'ods'
  | 'csv'
  | 'json';

/**
 * What kind of document a format holds.
 *
 * A text-flow document is a sequence of paragraphs; a spreadsheet is a grid;
 * a deck is a sequence of pages. Routing uses this to stop itself producing
 * something valid and useless — a spreadsheet flattened into prose and then
 * re-interpreted as a grid is not the spreadsheet you started with.
 */
export type Family = 'text' | 'sheet' | 'slides';

/**
 * How much of the source survives the trip.
 * - `exact`  — nothing is lost.
 * - `good`   — structure survives, presentation may shift.
 * - `lossy`  — something the user cares about is dropped. Say what.
 */
export type Fidelity = 'exact' | 'good' | 'lossy';

export interface OutputFile {
  blob: Blob;
  filename: string;
}

/**
 * How much a warning should alarm the person reading it.
 *
 * The three are decided by one question — what is different between the
 * document that went in and the one that came out?
 *
 * - `lost`    — something in the source is **not in the output**. An image, a
 *               footnote, a column past the page edge, a character no font can
 *               draw. This is the one that must never be missed, so it is never
 *               collapsed behind a disclosure.
 * - `changed` — everything is there, in a **different shape**. A merged cell
 *               flattened into a plain grid, a table written as tab-separated
 *               lines, a stylesheet that no longer applies.
 * - `note`    — nothing was lost or reshaped; this describes **how the
 *               conversion works** and what to check. Headings inferred from
 *               type size, the shape of the JSON a multi-sheet workbook makes.
 *
 * Severity is set where the warning is written, never guessed from its wording
 * in a component. A sentence is free to be rephrased; what it means is not.
 */
export type Severity = 'lost' | 'changed' | 'note';

export interface Warning {
  severity: Severity;
  /** One sentence, true whatever format the file arrived as. */
  message: string;
  /**
   * Which converter produced it, as `.docx → .md`.
   *
   * Set by `runRoute` and only on a routed pair, where "an image was not
   * carried over" reads very differently depending on which half lost it.
   */
  step?: string;
}

export interface ConversionResult {
  files: OutputFile[];
  /** Populated when the engine had to discard or reshape something. */
  warnings?: Warning[];
}

/**
 * What an engine is doing right now, so a conversion that takes a while can say
 * more than that it is running.
 *
 * Structured rather than a sentence: the interface owns the words, and a
 * `done`/`total` pair can drive a bar later without the engines being touched
 * again. An engine that cannot say where it is simply never calls this, and the
 * interface falls back to the phase.
 */
export interface Progress {
  phase: 'reading' | 'writing';
  /** What `done` and `total` are counting, when the engine can count.  */
  unit?: 'page' | 'sheet' | 'chapter' | 'slide';
  done?: number;
  total?: number;
  /** 1-based step of a routed conversion, and how many there are. */
  step?: number;
  steps?: number;
}

export type ProgressFn = (progress: Progress) => void;

/**
 * The function an engine module hands back once it has loaded.
 *
 * `onProgress` is optional on purpose: an engine with nothing useful to report
 * declares `(input: File)` and still satisfies this type, so adding progress
 * did not mean touching thirty-nine engines that have nothing to say.
 */
export type ConvertFn = (
  input: File,
  onProgress?: ProgressFn,
) => Promise<ConversionResult>;

/**
 * One declared edge, as the interface sees it.
 *
 * Deliberately has no reference to the engine that performs it: this type is
 * reached from the page, and anything here that pulls in an `import()` makes
 * the page's bundler emit a chunk for every engine. The engines are addressed
 * separately, in `engines.ts`, which only the worker imports.
 */
export interface Converter {
  from: Format;
  to: Format;
  /** Shown to the user before they commit, when not 'exact'. */
  fidelity: Fidelity;
  /** Human-readable note about what is lost. Required when fidelity is 'lossy'. */
  caveat?: string;
}

/**
 * How Recast will actually perform one pair: one declared converter, or two run
 * back to back.
 *
 * This is what the interface and the worker both hold. A single-step route and
 * a two-step route are the same shape on purpose — nothing downstream has to
 * ask which kind it got.
 */
export interface Route {
  from: Format;
  to: Format;
  /** One or two converters, in the order they run. */
  steps: Converter[];
  /** The worst link in the path. An `exact` step followed by a `lossy` one is `lossy`. */
  fidelity: Fidelity;
  /** Every step's caveat, in order, deduplicated. Empty for an `exact` route. */
  caveats: string[];
  /** The format the file passes through, when there is one. */
  via?: Format;
}
