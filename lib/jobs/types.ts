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
}
