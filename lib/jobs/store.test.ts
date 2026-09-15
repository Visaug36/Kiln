import { beforeEach, describe, expect, it } from 'vitest';
import type { ConversionResult } from '@/lib/registry/types';
import { useJobs } from './store';

const file = (name: string) => new File(['hello'], name, { type: 'text/plain' });
const result = (...filenames: string[]): ConversionResult => ({
  files: filenames.map((filename) => ({
    blob: new Blob(['hello'], { type: 'text/plain' }),
    filename,
  })),
});

beforeEach(() => {
  useJobs.getState().clear();
});

describe('addJob', () => {
  it('appends a queued job and returns its id', () => {
    const id = useJobs
      .getState()
      .addJob({ file: file('notes.md'), from: 'md', to: 'txt' });
    const [job] = useJobs.getState().jobs;

    expect(useJobs.getState().jobs).toHaveLength(1);
    expect(job).toMatchObject({ id, from: 'md', to: 'txt', state: 'queued' });
    expect(job?.result).toBeUndefined();
    expect(job?.error).toBeUndefined();
  });

  it('keeps jobs in the order they arrived and gives each a distinct id', () => {
    const first = useJobs
      .getState()
      .addJob({ file: file('a.md'), from: 'md', to: 'txt' });
    const second = useJobs
      .getState()
      .addJob({ file: file('b.md'), from: 'md', to: 'pdf' });

    expect(first).not.toBe(second);
    expect(useJobs.getState().jobs.map((j) => j.file.name)).toEqual(['a.md', 'b.md']);
  });
});

describe('setTarget', () => {
  it('changes the target of a queued job', () => {
    const id = useJobs
      .getState()
      .addJob({ file: file('notes.md'), from: 'md', to: 'txt' });
    useJobs.getState().setTarget(id, 'pdf');

    expect(useJobs.getState().jobs[0]?.to).toBe('pdf');
  });

  it('leaves the target alone once the job has started', () => {
    const id = useJobs
      .getState()
      .addJob({ file: file('notes.md'), from: 'md', to: 'txt' });
    useJobs.getState().setState(id, 'firing');
    useJobs.getState().setTarget(id, 'pdf');

    expect(useJobs.getState().jobs[0]?.to).toBe('txt');
  });
});

describe('setState', () => {
  it('moves a job between states', () => {
    const id = useJobs
      .getState()
      .addJob({ file: file('notes.md'), from: 'md', to: 'txt' });
    useJobs.getState().setState(id, 'firing');

    expect(useJobs.getState().jobs[0]?.state).toBe('firing');
  });

  it('ignores an unknown id', () => {
    useJobs.getState().addJob({ file: file('notes.md'), from: 'md', to: 'txt' });
    const before = useJobs.getState().jobs;
    useJobs.getState().setState('nope', 'firing');

    expect(useJobs.getState().jobs[0]?.state).toBe('queued');
    expect(useJobs.getState().jobs).toHaveLength(before.length);
  });
});

describe('setResult', () => {
  it('stores the result and marks the job done', () => {
    const id = useJobs
      .getState()
      .addJob({ file: file('notes.md'), from: 'md', to: 'txt' });
    useJobs.getState().setState(id, 'firing');
    useJobs.getState().setResult(id, result('notes.txt'));

    expect(useJobs.getState().jobs[0]).toMatchObject({
      state: 'done',
      result: { files: [{ filename: 'notes.txt' }] },
    });
  });

  it('clears an earlier error', () => {
    const id = useJobs
      .getState()
      .addJob({ file: file('notes.md'), from: 'md', to: 'txt' });
    useJobs.getState().setError(id, 'Not implemented');
    useJobs.getState().setResult(id, result('notes.txt'));

    expect(useJobs.getState().jobs[0]?.error).toBeUndefined();
  });
});

describe('setError', () => {
  it('stores the message and marks the job failed', () => {
    const id = useJobs
      .getState()
      .addJob({ file: file('notes.md'), from: 'md', to: 'txt' });
    useJobs.getState().setError(id, 'Not implemented');

    expect(useJobs.getState().jobs[0]).toMatchObject({
      state: 'failed',
      error: 'Not implemented',
    });
  });

  it('touches only the job it names', () => {
    const first = useJobs
      .getState()
      .addJob({ file: file('a.md'), from: 'md', to: 'txt' });
    useJobs.getState().addJob({ file: file('b.md'), from: 'md', to: 'txt' });
    useJobs.getState().setError(first, 'Not implemented');

    expect(useJobs.getState().jobs[1]?.state).toBe('queued');
    expect(useJobs.getState().jobs[1]?.error).toBeUndefined();
  });
});

describe('clear', () => {
  it('empties the list', () => {
    useJobs.getState().addJob({ file: file('a.md'), from: 'md', to: 'txt' });
    useJobs.getState().addJob({ file: file('b.md'), from: 'md', to: 'txt' });
    useJobs.getState().clear();

    expect(useJobs.getState().jobs).toEqual([]);
  });
});

describe('multi-file results', () => {
  it('keeps every produced file on the job', () => {
    const id = useJobs
      .getState()
      .addJob({ file: file('book.xlsx'), from: 'xlsx', to: 'csv' });
    useJobs.getState().setResult(id, result('book-q1.csv', 'book-q2.csv', 'book-q3.csv'));

    expect(useJobs.getState().jobs[0]?.result?.files).toHaveLength(3);
    expect(useJobs.getState().jobs[0]?.result?.files.map((f) => f.filename)).toEqual([
      'book-q1.csv',
      'book-q2.csv',
      'book-q3.csv',
    ]);
  });

  it('carries warnings through to the row', () => {
    const id = useJobs
      .getState()
      .addJob({ file: file('book.xlsx'), from: 'xlsx', to: 'md' });
    useJobs.getState().setResult(id, {
      ...result('book.md'),
      warnings: ['A chart was not carried over.'],
    });

    expect(useJobs.getState().jobs[0]?.result?.warnings).toEqual([
      'A chart was not carried over.',
    ]);
  });
});

describe('content that disagrees with the extension', () => {
  it('records what the name claimed', () => {
    useJobs
      .getState()
      .addJob({ file: file('report.docx'), from: 'xlsx', to: 'csv', detectedAs: 'docx' });

    expect(useJobs.getState().jobs[0]?.detectedAs).toBe('docx');
  });
});
