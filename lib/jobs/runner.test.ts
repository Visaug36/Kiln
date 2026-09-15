import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useJobs } from './store';
import { TIMEOUT_MS, enqueue, resetWorker } from './runner';

/**
 * A stand-in for the conversion worker.
 *
 * jsdom has no Worker, and spinning up the real one would drag every engine
 * into the test. What matters here is the runner's contract: it serialises
 * jobs, it gives up after a minute, and a job that had to be killed does not
 * poison the ones behind it.
 */
class FakeWorker {
  static instances: FakeWorker[] = [];
  static behaviour: 'reply' | 'hang' | 'error' = 'reply';

  terminated = false;
  private listeners = new Map<string, Set<(event: unknown) => void>>();

  constructor() {
    FakeWorker.instances.push(this);
  }

  addEventListener(type: string, handler: (event: unknown) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(handler);
  }

  removeEventListener(type: string, handler: (event: unknown) => void) {
    this.listeners.get(type)?.delete(handler);
  }

  private emit(type: string, event: unknown) {
    for (const handler of this.listeners.get(type) ?? []) handler(event);
  }

  postMessage(request: { jobId: string }) {
    if (FakeWorker.behaviour === 'hang') return;

    // Real workers reply asynchronously; keep that shape.
    queueMicrotask(() => {
      if (FakeWorker.behaviour === 'error') {
        this.emit('error', new Event('error'));
        return;
      }
      this.emit('message', {
        data: {
          jobId: request.jobId,
          result: {
            files: [{ blob: new Blob(['converted']), filename: 'out.txt' }],
          },
        },
      });
    });
  }

  terminate() {
    this.terminated = true;
  }
}

const file = (name: string) => new File(['hello'], name);

beforeEach(() => {
  vi.stubGlobal('Worker', FakeWorker as unknown as typeof Worker);
  FakeWorker.instances = [];
  FakeWorker.behaviour = 'reply';
  useJobs.getState().clear();
  resetWorker();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetWorker();
});

/** Lets the runner's promise chain settle. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('running a conversion', () => {
  it('moves the job through firing to done', async () => {
    const id = useJobs.getState().addJob({ file: file('a.md'), from: 'md', to: 'txt' });

    enqueue(id);
    await settle();

    expect(useJobs.getState().jobs[0]?.state).toBe('done');
    expect(useJobs.getState().jobs[0]?.result?.files[0]?.filename).toBe('out.txt');
  });

  it('reuses one worker across jobs', async () => {
    const first = useJobs
      .getState()
      .addJob({ file: file('a.md'), from: 'md', to: 'txt' });
    const second = useJobs
      .getState()
      .addJob({ file: file('b.md'), from: 'md', to: 'txt' });

    enqueue(first);
    enqueue(second);
    await settle();

    expect(FakeWorker.instances).toHaveLength(1);
    expect(useJobs.getState().jobs.every((j) => j.state === 'done')).toBe(true);
  });

  it('ignores a job that is no longer queued', async () => {
    const id = useJobs.getState().addJob({ file: file('a.md'), from: 'md', to: 'txt' });
    useJobs.getState().setState(id, 'done');

    enqueue(id);
    await settle();

    expect(FakeWorker.instances).toHaveLength(0);
  });
});

describe('when a conversion wedges', () => {
  it('fails the job after the timeout with something a person can read', async () => {
    vi.useFakeTimers();
    FakeWorker.behaviour = 'hang';

    const id = useJobs
      .getState()
      .addJob({ file: file('huge.pdf'), from: 'pdf', to: 'txt' });
    enqueue(id);
    await vi.advanceTimersByTimeAsync(0);

    expect(useJobs.getState().jobs[0]?.state).toBe('firing');

    await vi.advanceTimersByTimeAsync(TIMEOUT_MS + 10);

    const job = useJobs.getState().jobs[0];
    expect(job?.state).toBe('failed');
    expect(job?.error).toMatch(/more than a minute/);
    expect(job?.error).not.toMatch(/Error|undefined|\[object/);
  });

  it('terminates the wedged worker and builds a fresh one for the next job', async () => {
    vi.useFakeTimers();
    FakeWorker.behaviour = 'hang';

    const stuck = useJobs
      .getState()
      .addJob({ file: file('huge.pdf'), from: 'pdf', to: 'txt' });
    enqueue(stuck);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS + 10);

    expect(FakeWorker.instances[0]?.terminated).toBe(true);

    // The queue has to keep working after a kill, or one bad file ends the session.
    FakeWorker.behaviour = 'reply';
    const next = useJobs.getState().addJob({ file: file('b.md'), from: 'md', to: 'txt' });
    enqueue(next);
    await vi.advanceTimersByTimeAsync(10);

    expect(FakeWorker.instances).toHaveLength(2);
    expect(useJobs.getState().jobs[1]?.state).toBe('done');
  });
});

describe('when the worker itself fails', () => {
  it('reports it without leaking the event object', async () => {
    FakeWorker.behaviour = 'error';

    const id = useJobs.getState().addJob({ file: file('a.md'), from: 'md', to: 'txt' });
    enqueue(id);
    await settle();

    const job = useJobs.getState().jobs[0];
    expect(job?.state).toBe('failed');
    expect(job?.error).toMatch(/Something went wrong/);
    expect(job?.error).not.toMatch(/\[object/);
  });
});
