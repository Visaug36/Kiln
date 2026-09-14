import { baseName } from '@/lib/files/detect';
import { find } from '@/lib/registry';
import { useJobs } from './store';

/**
 * Conversions are serialised through this promise chain. Engines will do real
 * work on the main thread, so running two at once would make the page stutter;
 * one at a time keeps it responsive and keeps the row states honest.
 */
let queue: Promise<void> = Promise.resolve();

/** Turns whatever an engine threw into a sentence the interface can show. */
function messageFor(cause: unknown): string {
  if (cause instanceof Error && cause.message) return cause.message;
  return 'This file could not be converted. Try a different target format.';
}

export function enqueue(id: string): void {
  queue = queue.then(async () => {
    const store = useJobs.getState();
    const job = store.jobs.find((j) => j.id === id);
    if (!job || job.state !== 'queued') return;

    const converter = find(job.from, job.to);
    if (!converter) {
      store.setError(id, `Kiln cannot turn .${job.from} into .${job.to}.`);
      return;
    }

    store.setState(id, 'firing');
    try {
      const convert = await converter.load();
      const result = await convert(job.file);
      useJobs.getState().setResult(id, result);
    } catch (cause) {
      useJobs.getState().setError(id, messageFor(cause));
    }
  });
}

/** The name a converted file is offered under, when an engine does not pick one. */
export function defaultFilename(original: string, to: string): string {
  return `${baseName(original)}.${to}`;
}
