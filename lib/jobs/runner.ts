import type { ConvertRequest, ConvertResponse } from '@/lib/workers/convert.worker';
import { useJobs } from './store';

/** A conversion that has not finished in this long is treated as wedged. */
export const TIMEOUT_MS = 60_000;

/**
 * The worker is built separately into public/kiln-worker/ and referenced by
 * URL. Next's bundler does not compile `new Worker(new URL('./x.ts', ...))` for
 * the client build — it copies the TypeScript source through as a static asset,
 * so the deployed page would fetch raw TypeScript and fail every conversion
 * while dev, tests and the build all stayed green. See scripts/build-worker.mjs.
 */
const WORKER_URL = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/kiln-worker/convert.worker.js`;

let worker: Worker | null = null;

/** One worker, replaced whenever a job has to be killed. */
function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(WORKER_URL, { type: 'module' });
  }
  return worker;
}

function replaceWorker() {
  worker?.terminate();
  worker = null;
}

/**
 * Conversions are serialised through this promise chain. Running several at
 * once would multiply peak memory on files that are already held whole, and the
 * row states would stop meaning anything.
 */
let queue: Promise<void> = Promise.resolve();

function runOne(request: ConvertRequest): Promise<void> {
  return new Promise<void>((resolve) => {
    const active = getWorker();
    let settled = false;

    /** Returns true when this round is already over, so callers can bail. */
    const finish = () => {
      if (settled) return true;
      settled = true;
      clearTimeout(timer);
      active.removeEventListener('message', onMessage);
      active.removeEventListener('error', onError);
      resolve();
      return false;
    };

    const onMessage = (event: MessageEvent<ConvertResponse>) => {
      if (event.data.jobId !== request.jobId) return;
      if (finish()) return;

      const store = useJobs.getState();
      if ('error' in event.data) {
        store.setError(request.jobId, event.data.error);
      } else {
        store.setResult(request.jobId, event.data.result);
      }
    };

    const onError = () => {
      if (finish()) return;
      replaceWorker();
      useJobs
        .getState()
        .setError(
          request.jobId,
          'Something went wrong while converting this file. Try a different target format.',
        );
    };

    // A wedged engine would otherwise hold the queue forever, so the worker is
    // killed and rebuilt — later jobs still run.
    const timer = setTimeout(() => {
      if (finish()) return;
      replaceWorker();
      useJobs
        .getState()
        .setError(
          request.jobId,
          'This file took more than a minute and was stopped. It may be very large or unusually complex.',
        );
    }, TIMEOUT_MS);

    active.addEventListener('message', onMessage);
    active.addEventListener('error', onError);
    active.postMessage(request);
  });
}

export function enqueue(id: string): void {
  queue = queue.then(async () => {
    const store = useJobs.getState();
    const job = store.jobs.find((j) => j.id === id);
    if (!job || job.state !== 'queued') return;

    store.setState(id, 'firing');
    await runOne({ jobId: id, file: job.file, from: job.from, to: job.to });
  });
}

/** Test seam: forget the current worker so the next job builds a fresh one. */
export function resetWorker(): void {
  replaceWorker();
}
