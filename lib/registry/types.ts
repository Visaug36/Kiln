/** Every document format Kiln knows how to read or write. */
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

export interface ConversionResult {
  files: OutputFile[];
  /** Populated when the engine had to discard something. Shown after conversion. */
  warnings?: string[];
}

/** The function an engine module hands back once it has loaded. */
export type ConvertFn = (input: File) => Promise<ConversionResult>;

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
 * How Kiln will actually perform one pair: one declared converter, or two run
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
