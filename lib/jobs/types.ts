import type { ConversionResult, Format } from '@/lib/registry/types';

export type JobState = 'queued' | 'firing' | 'done' | 'failed';

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
   * For an archive, what it holds unpacked. The engines work on that, not on
   * the file, so it is what the memory estimate has to be made from.
   */
  expandedSize?: number;
}
