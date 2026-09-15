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

export interface Converter {
  from: Format;
  to: Format;
  /** Shown to the user before they commit, when not 'exact'. */
  fidelity: Fidelity;
  /** Human-readable note about what is lost. Required when fidelity is 'lossy'. */
  caveat?: string;
  /** Dynamic import of the engine, so heavy libs are never in the initial bundle. */
  load: () => Promise<ConvertFn>;
}
