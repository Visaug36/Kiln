import type { ConversionResult, Format, Progress } from '@/lib/registry/types';

/**
 * `converting` was `firing`, which was a kiln's word for it. The interface no
 * longer shows a state name at all — it shows what the worker is doing — but
 * the state itself is still what decides which controls a row offers.
 */
export type JobState = 'queued' | 'converting' | 'done' | 'failed';

export interface Job {
  id: string;
  file: File;
  from: Format;
  to: Format;
  state: JobState;
  result?: ConversionResult;
  error?: string;
  /** Set when the extension claimed one format and the bytes said another. */
  detectedAs?: Format;
  /**
   * The last thing the worker said it was doing. Cleared when the job settles,
   * so a finished row cannot show a stale page number.
   */
  progress?: Progress;
  /**
   * For an archive, what it holds unpacked. The engines work on that, not on
   * the file, so it is what the memory estimate has to be made from.
   */
  expandedSize?: number;
}
