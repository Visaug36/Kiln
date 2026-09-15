/** Every document format Kiln knows how to read or write. */
export type Format = 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'csv' | 'md' | 'txt' | 'rtf';

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
 * One declared pair, as the interface sees it.
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
