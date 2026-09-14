import { create } from 'zustand';
import type { ConversionResult, Format } from '@/lib/registry/types';
import type { Job, JobState } from './types';

let counter = 0;

function nextId(): string {
  counter += 1;
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `job-${counter}`;
}

export interface JobsStore {
  jobs: Job[];
  /** Queues a file and returns the new job's id. */
  addJob: (file: File, from: Format, to: Format) => string;
  /** Changes the chosen target while the job is still queued. */
  setTarget: (id: string, to: Format) => void;
  setState: (id: string, state: JobState) => void;
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

  addJob: (file, from, to) => {
    const id = nextId();
    const job: Job = { id, file, from, to, state: 'queued' };
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

  setResult: (id: string, result: ConversionResult) =>
    set((s) => ({
      jobs: patchJob(s.jobs, id, { state: 'done', result, error: undefined }),
    })),

  setError: (id, error) =>
    set((s) => ({
      jobs: patchJob(s.jobs, id, { state: 'failed', error, result: undefined }),
    })),

  clear: () => set({ jobs: [] }),
}));
