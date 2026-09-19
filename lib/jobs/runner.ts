import type { ConvertResponse, WorkerRequest } from '@/lib/workers/convert.worker';
import type { Format } from '@/lib/registry/types';
import { useJobs } from './store';

/** A conversion that has not finished in this long is treated as wedged. */
export const TIMEOUT_MS = 60_000;

/** Opening an archive to identify it should be near-instant. */
export const DETECT_TIMEOUT_MS = 15_000;

let detectCounter = 0;

/** What the worker could tell us about a dropped archive. */
export interface ArchiveAnswer {
  format: Format | undefined;
  /** The archive's unpacked size, when the zip headers recorded it. */
  expanded?: number;
}

/**
 * The worker is built separately into public/recast-worker/ and referenced by
 * URL. Next's bundler does not compile `new Worker(new URL('./x.ts', ...))` for
 * the client build — it copies the TypeScript source through as a static asset,
 * so the deployed page would fetch raw TypeScript and fail every conversion
 * while dev, tests and the build all stayed green. See scripts/build-worker.mjs.
 */
const WORKER_URL = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/recast-worker/convert.worker.js`;

let worker: Worker | null = null;

/**
 * Anything waiting on the current worker that is not a queued conversion.
 *
 * A dedicated worker the browser kills — out of memory, say — fires no event at
 * all, so a caller holding a listener on it would simply wait. Killing the
 * worker settles them instead of leaving them to time out.
 */
const pending = new Set<() => void>();

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
  for (const abandon of [...pending]) abandon();
  pending.clear();
}

/**
 * Conversions are serialised through this promise chain. Running several at
 * once would multiply peak memory on files that are already held whole, and the
 * row states would stop meaning anything.
 */
let queue: Promise<void> = Promise.resolve();

function runOne(request: WorkerRequest): Promise<void> {
  return new Promise<void>((resolve) => {
    const active = getWorker();
    let settled = false;

    // Declared before `restartTimer` runs: the first call clears it, and a
    // `let` read before its initialiser throws rather than reading undefined.
    let timer: ReturnType<typeof setTimeout> | undefined;

    /** Returns true when this round is already over, so callers can bail. */
    const finish = () => {
      if (settled) return true;
      settled = true;
      clearTimeout(timer);
      active.removeEventListener('message', onMessage);
      active.removeEventListener('error', onError);
      active.removeEventListener('messageerror', onError);
      resolve();
      return false;
    };

    const onMessage = (event: MessageEvent<ConvertResponse>) => {
      if (event.data.jobId !== request.jobId) return;

      // Progress is not the end of the round: it must not call finish(), and it
      // restarts the clock. A conversion that is visibly getting somewhere is
      // not wedged, and killing it at sixty seconds because a long PDF is still
      // on page 300 would be the wrong answer.
      if ('progress' in event.data) {
        useJobs.getState().setProgress(request.jobId, event.data.progress);
        timer = restartTimer();
        return;
      }

      if (finish()) return;

      const store = useJobs.getState();
      if ('error' in event.data) {
        store.setError(request.jobId, event.data.error);
      } else if ('result' in event.data) {
        store.setResult(request.jobId, event.data.result);
      }
    };

    // `error` is a throw inside the worker; `messageerror` is a message that
    // could not be handed across at all. Both end this job the same way.
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
    function restartTimer() {
      if (timer !== undefined) clearTimeout(timer);
      return setTimeout(() => {
        if (finish()) return;
        replaceWorker();
        useJobs
          .getState()
          .setError(
            request.jobId,
            'This file took more than a minute without reporting any progress and was stopped. It may be very large or unusually complex, or this browser may have run out of memory holding it.',
          );
      }, TIMEOUT_MS);
    }

    timer = restartTimer();

    active.addEventListener('message', onMessage);
    active.addEventListener('error', onError);
    active.addEventListener('messageerror', onError);
    active.postMessage(request);
  });
}

export function enqueue(id: string): void {
  queue = queue
    .then(async () => {
      const store = useJobs.getState();
      const job = store.jobs.find((j) => j.id === id);
      if (!job || job.state !== 'queued') return;

      store.setState(id, 'converting');
      await runOne({ jobId: id, file: job.file, from: job.from, to: job.to });
    })
    // A rejection here would leave `queue` permanently rejected, and every job
    // queued afterwards would be skipped in silence — one bad file ending the
    // session. runOne resolves rather than rejects, so this should never fire,
    // which is exactly why it must not be left to chance.
    .catch((cause) => {
      console.error('[recast] job runner failed', cause);
      const job = useJobs.getState().jobs.find((j) => j.id === id);
      if (job && job.state === 'converting') {
        useJobs
          .getState()
          .setError(id, 'Something went wrong while converting this file.');
      }
    });
}

/**
 * Asks the worker which OOXML format an archive is.
 *
 * Detection lives in the worker because answering needs a zip library, and the
 * worker already has one — keeping it off the page saves every visitor who
 * drops an Office file a second copy of JSZip.
 *
 * Deliberately not queued behind conversions: dropping a file has to stay
 * responsive, and a detect that waited out a minute-long conversion would be
 * useless. It shares the worker, so it is registered in `pending` and settles
 * immediately if that worker is killed underneath it.
 */
export function detectArchive(file: File): Promise<ArchiveAnswer> {
  return new Promise((resolve) => {
    const jobId = `detect-${detectCounter++}`;
    let settled = false;

    const active = getWorker();

    const finish = (answer: ArchiveAnswer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      pending.delete(abandon);
      active.removeEventListener('message', onMessage);
      active.removeEventListener('error', onError);
      active.removeEventListener('messageerror', onError);
      resolve(answer);
    };

    /** The worker went away. Fall back to "cannot tell" rather than waiting. */
    const abandon = () => finish({ format: undefined });

    const onMessage = (event: MessageEvent<ConvertResponse>) => {
      if (event.data.jobId !== jobId) return;
      finish(
        'detected' in event.data
          ? { format: event.data.detected, expanded: event.data.expanded }
          : { format: undefined },
      );
    };

    const onError = () => {
      replaceWorker();
      finish({ format: undefined });
    };

    // A damaged archive should not hold up the drop; fall back to "unreadable".
    const timer = setTimeout(() => finish({ format: undefined }), DETECT_TIMEOUT_MS);

    pending.add(abandon);
    active.addEventListener('message', onMessage);
    active.addEventListener('error', onError);
    active.addEventListener('messageerror', onError);
    active.postMessage({ kind: 'detect', jobId, file } satisfies WorkerRequest);
  });
}

/** Test seam: forget the current worker so the next job builds a fresh one. */
export function resetWorker(): void {
  replaceWorker();
}
