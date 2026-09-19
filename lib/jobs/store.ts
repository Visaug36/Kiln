import { create } from 'zustand';
import type { ConversionResult, Format, Progress } from '@/lib/registry/types';
import type { Job, JobState } from './types';

let counter = 0;

function nextId(): string {
  counter += 1;
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `job-${counter}`;
}

export interface NewJob {
  file: File;
  from: Format;
  to: Format;
  /** Set when the bytes disagreed with the extension. */
  detectedAs?: Format;
  /** For an archive, its unpacked size. See `Job`. */
  expandedSize?: number;
}

export interface JobsStore {
  jobs: Job[];
  /** Queues a file and returns the new job's id. */
  addJob: (job: NewJob) => string;
  /** Changes the chosen target while the job is still queued. */
  setTarget: (id: string, to: Format) => void;
  setState: (id: string, state: JobState) => void;
  /** Records what the worker is doing now. Ignored once a job has settled. */
  setProgress: (id: string, progress: Progress) => void;
  /** Recording a result also moves the job to 'done'. */
  setResult: (id: string, result: ConversionResult) => void;
  /** Recording an error also moves the job to 'failed'. */
  setError: (id: string, error: string) => void;
  clear: () => void;
}

/** Applies `patch` to one job, leaving every other job untouched. */
function patchJob(jobs: Job[], id: string, patch: Partial<Job>): Job[] {
  return jobs.map((job) => (job.id === id ? { ...job, ...patch } : job));
}

/**
 * Jobs live here and nowhere else. They hold real `File` handles, so they are
 * deliberately not persisted — a refresh clears the page and the files with it.
 */
export const useJobs = create<JobsStore>((set) => ({
  jobs: [],

  addJob: ({ file, from, to, detectedAs, expandedSize }) => {
    const id = nextId();
    const job: Job = { id, file, from, to, state: 'queued', detectedAs, expandedSize };
    set((s) => ({ jobs: [...s.jobs, job] }));
    return id;
  },

  setTarget: (id, to) =>
    set((s) => ({
      jobs: s.jobs.map((job) =>
        job.id === id && job.state === 'queued' ? { ...job, to } : job,
      ),
    })),

  setState: (id, state) => set((s) => ({ jobs: patchJob(s.jobs, id, { state }) })),

  // A progress message can arrive after the result, because both cross the
  // worker boundary and only the result ends the job. Dropping it for anything
  // but a converting job is what stops a finished row reverting to "reading
  // page 3 of 12".
  setProgress: (id, progress) =>
    set((s) => ({
      jobs: s.jobs.map((job) =>
        job.id === id && job.state === 'converting' ? { ...job, progress } : job,
      ),
    })),

  setResult: (id, result) =>
    set((s) => ({
      jobs: patchJob(s.jobs, id, {
        state: 'done',
        result,
        error: undefined,
        progress: undefined,
      }),
    })),

  setError: (id, error) =>
    set((s) => ({
      jobs: patchJob(s.jobs, id, {
        state: 'failed',
        error,
        result: undefined,
        progress: undefined,
      }),
    })),

  clear: () => set({ jobs: [] }),
}));
