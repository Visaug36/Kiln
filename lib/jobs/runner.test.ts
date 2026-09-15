import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useJobs } from './store';
import { TIMEOUT_MS, detectArchive, enqueue, resetWorker } from './runner';

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
  static behaviour: 'reply' | 'hang' | 'error' | 'messageerror' = 'reply';

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
      if (FakeWorker.behaviour === 'messageerror') {
        this.emit('messageerror', new Event('messageerror'));
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

describe('when something inside the runner itself throws', () => {
  it('keeps draining the queue instead of dying silently', async () => {
    FakeWorker.behaviour = 'reply';

    const first = useJobs
      .getState()
      .addJob({ file: file('a.md'), from: 'md', to: 'txt' });
    const second = useJobs
      .getState()
      .addJob({ file: file('b.md'), from: 'md', to: 'txt' });

    // A throw inside one queued turn used to leave the chain permanently
    // rejected, so every job behind it was skipped without a word.
    const store = useJobs.getState();
    const realSetState = store.setState;
    let thrown = false;
    useJobs.setState({
      setState: (id, state) => {
        if (!thrown && id === first) {
          thrown = true;
          throw new Error('boom');
        }
        realSetState(id, state);
      },
    });

    enqueue(first);
    enqueue(second);
    await settle();
    await settle();

    useJobs.setState({ setState: realSetState });

    expect(thrown).toBe(true);
    expect(useJobs.getState().jobs[1]?.state, 'the job behind the throw never ran').toBe(
      'done',
    );
  });
});

describe('when the worker dies without saying so', () => {
  it('reports a message that could not be handed across at all', async () => {
    // A worker the browser kills fires nothing, but a payload it cannot clone
    // fires `messageerror` — which used to be ignored, leaving the job to sit
    // at "Firing…" for the full minute.
    FakeWorker.behaviour = 'messageerror';

    const id = useJobs.getState().addJob({ file: file('a.md'), from: 'md', to: 'txt' });
    enqueue(id);
    await settle();

    const job = useJobs.getState().jobs[0];
    expect(job?.state).toBe('failed');
    expect(job?.error).toMatch(/Something went wrong/);
  });

  it('blames memory as one possibility when a job has to be killed', async () => {
    vi.useFakeTimers();
    FakeWorker.behaviour = 'hang';

    const id = useJobs
      .getState()
      .addJob({ file: file('huge.docx'), from: 'docx', to: 'pdf' });
    enqueue(id);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS + 10);

    expect(useJobs.getState().jobs[0]?.error).toMatch(/run out of memory/);
  });

  it('settles a detection left behind by a killed worker instead of waiting', async () => {
    vi.useFakeTimers();
    FakeWorker.behaviour = 'hang';

    const stuck = useJobs
      .getState()
      .addJob({ file: file('huge.pdf'), from: 'pdf', to: 'txt' });
    enqueue(stuck);

    // A file dropped near the end of a wedged conversion. A timeout kill fires
    // no `error` event, so nothing tells this detect its worker is gone: it used
    // to wait out its own 15 seconds for an answer that could never arrive.
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 1000);
    let answered = false;
    const detecting = detectArchive(file('mystery.zip')).then((answer) => {
      answered = true;
      return answer;
    });

    await vi.advanceTimersByTimeAsync(1100);

    expect(answered, 'the kill did not settle the detection').toBe(true);
    await expect(detecting).resolves.toEqual({ format: undefined });
  });

  it('keeps converting after a detection is abandoned', async () => {
    vi.useFakeTimers();
    FakeWorker.behaviour = 'hang';

    void detectArchive(file('mystery.zip'));
    const stuck = useJobs
      .getState()
      .addJob({ file: file('a.pdf'), from: 'pdf', to: 'txt' });
    enqueue(stuck);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS + 10);

    FakeWorker.behaviour = 'reply';
    const next = useJobs.getState().addJob({ file: file('b.md'), from: 'md', to: 'txt' });
    enqueue(next);
    await vi.advanceTimersByTimeAsync(10);

    expect(useJobs.getState().jobs[1]?.state).toBe('done');
  });
});
