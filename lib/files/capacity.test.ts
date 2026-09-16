import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EDGE_COST,
  capacity,
  footprintFor,
  sizeCaution,
  type Capacity,
} from './capacity';

/**
 * The pre-flight guard.
 *
 * None of these numbers are measurements — they are a prediction made from the
 * file size, and the point of the tests is that the prediction is made at all,
 * that it is tighter on iOS, and that it says out loud that it is a guess. A
 * browser killed for running out of memory throws nothing, so there is no later
 * moment at which Kiln could say any of this.
 */

const MB = 1024 * 1024;
const file = (megabytes: number, name = 'big.docx') => {
  const handle = new File(['x'], name);
  Object.defineProperty(handle, 'size', { value: megabytes * MB });
  return handle;
};

const ios: Capacity = { budget: 350 * MB, webkitMobile: true, basis: 'ios' };
const desktop: Capacity = { budget: 1024 * MB, webkitMobile: false, basis: 'assumed' };

afterEach(() => vi.unstubAllGlobals());

describe('reading what the platform will tell us', () => {
  it('prefers the real heap limit where Chromium exposes one', () => {
    vi.stubGlobal('performance', {
      memory: { jsHeapSizeLimit: 4096 * MB, usedJSHeapSize: 96 * MB },
    });

    const limits = capacity();
    expect(limits.basis).toBe('heap');
    expect(limits.budget).toBeCloseTo(4000 * MB * 0.6, -6);
  });

  it('falls back to deviceMemory when there is no heap reading', () => {
    vi.stubGlobal('performance', {});
    vi.stubGlobal('navigator', {
      userAgent: 'Chrome',
      deviceMemory: 8,
      maxTouchPoints: 0,
    });

    const limits = capacity();
    expect(limits.basis).toBe('deviceMemory');
    expect(limits.budget).toBe(8 * 1024 * MB * 0.25);
  });

  it('recognises an iPad, which reports itself as a Mac', () => {
    vi.stubGlobal('performance', {});
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
      maxTouchPoints: 5,
    });

    const limits = capacity();
    expect(limits.webkitMobile).toBe(true);
    expect(limits.basis).toBe('ios');
  });

  it('gives iOS a tighter budget than anything else', () => {
    vi.stubGlobal('performance', {});
    vi.stubGlobal('navigator', { userAgent: 'iPhone Safari', maxTouchPoints: 5 });
    const phone = capacity();

    vi.stubGlobal('navigator', { userAgent: 'Firefox', maxTouchPoints: 0 });
    const computer = capacity();

    expect(phone.budget).toBeLessThan(computer.budget);
  });
});

describe('the caution itself', () => {
  it('stays quiet about a file that comfortably fits', () => {
    expect(sizeCaution(file(0.2), 'docx', 'pdf', { limits: desktop })).toBeUndefined();
    expect(
      sizeCaution(file(1, 'notes.txt'), 'txt', 'pdf', { limits: ios }),
    ).toBeUndefined();
  });

  it('warns on a file the same browser could not hold', () => {
    const caution = sizeCaution(file(25, 'big.txt'), 'txt', 'pdf', { limits: ios });

    expect(caution).toBeDefined();
    expect(caution!.estimate).toBe(25 * MB * footprintFor('txt', 'pdf'));
  });

  it('warns sooner on a phone than on a computer', () => {
    // The whole point of the split: a file that is fine on a laptop is not
    // necessarily fine on an iPhone, and iOS gives no second chance.
    const modest = file(0.5);

    expect(sizeCaution(modest, 'docx', 'pdf', { limits: desktop })).toBeUndefined();
    expect(sizeCaution(modest, 'docx', 'pdf', { limits: ios })).toBeDefined();
  });

  it('says it is a guess, and says what to do instead', () => {
    const message = sizeCaution(file(4), 'docx', 'pdf', { limits: desktop })!.message;

    expect(message).toMatch(/estimate|may/i);
    expect(message).toMatch(/rather than a measurement/i);
    expect(message).toMatch(/desktop browser|smaller file/i);
  });

  it('explains the iOS failure rather than blaming the file', () => {
    const message = sizeCaution(file(4), 'docx', 'pdf', { limits: ios })!.message;

    expect(message).toMatch(/without an error|closes/i);
    expect(message).not.toMatch(/!/); // Kiln's copy has no exclamation marks.
  });

  it('measures an archive by what it unpacks to, not by its file size', () => {
    // A 1 MB DOCX of plain text unpacks to tens of megabytes. Judging it by the
    // compressed size said nothing; judging it by a fixed ratio guessed wrong
    // in both directions.
    const small = file(1);

    const byRatio = sizeCaution(small, 'docx', 'pdf', { limits: ios });
    const byTruth = sizeCaution(small, 'docx', 'pdf', {
      expandedSize: 40 * MB,
      limits: ios,
    });

    expect(byTruth!.estimate).toBe(40 * MB * footprintFor('docx', 'pdf'));
    expect(byTruth!.estimate).toBeGreaterThan(byRatio!.estimate);
  });

  it('does not over-count an archive that is mostly already-compressed images', () => {
    // 20 MB of JPEGs in a .docx barely expands, so the assumed ratio guesses
    // far too high. Knowing the real figure pulls the estimate back down.
    const photos = file(20);

    const guessed = sizeCaution(photos, 'docx', 'pdf', { limits: desktop })!;
    const known = sizeCaution(photos, 'docx', 'pdf', {
      expandedSize: 21 * MB,
      limits: desktop,
    })!;

    expect(known.estimate).toBeLessThan(guessed.estimate);
  });

  it('has a measured cost for every edge the registry declares', async () => {
    const { converters } = await import('@/lib/registry');
    for (const { from, to } of converters) {
      const cost = EDGE_COST[`${from}>${to}`];
      expect(cost, `${from} → ${to} has no measured cost`).toBeDefined();
      expect(cost!.peak, `${from} → ${to} peak`).toBeGreaterThan(0);
      expect(cost!.growth, `${from} → ${to} growth`).toBeGreaterThan(0);
    }
  });

  it('has no cost for an edge the registry does not declare', async () => {
    const { converters } = await import('@/lib/registry');
    const declared = new Set(converters.map((c) => `${c.from}>${c.to}`));
    expect(Object.keys(EDGE_COST).filter((key) => !declared.has(key))).toEqual([]);
  });

  it('composes a routed pair’s cost from its edges', async () => {
    const { allRoutes } = await import('@/lib/registry');

    // Two engines run one after the other, so the peak is the larger of their
    // two peaks — never their sum. The second one's peak is scaled by how much
    // the first grew the file, because that is what it is handed.
    for (const route of allRoutes()) {
      let worst = 0;
      let scale = 1;
      for (const step of route.steps) {
        const cost = EDGE_COST[`${step.from}>${step.to}`]!;
        worst = Math.max(worst, scale * cost.peak);
        scale *= cost.growth;
      }
      expect(footprintFor(route.from, route.to), `${route.from} → ${route.to}`).toBe(
        Math.round(worst),
      );
    }
  });

  it('does not simply add the two steps together', async () => {
    const { find } = await import('@/lib/registry');

    // Adding them would cry wolf on every routed pair. `epub → odt` goes
    // through Markdown, which is smaller than the book it came from, so the
    // composed figure is visibly under the sum rather than merely equal to it.
    const route = find('epub', 'odt')!;
    expect(route.via).toBe('md');

    const first = EDGE_COST['epub>md']!;
    const second = EDGE_COST['md>odt']!;
    expect(first.growth).toBeLessThan(1);
    expect(footprintFor('epub', 'odt')).toBeLessThan(first.peak + second.peak);
  });

  it('judges a pair by its own cost, not its source format’s worst', () => {
    // md → pdf is the heavy one; md → txt is not, and used to be judged by it.
    expect(footprintFor('md', 'txt')).toBeLessThan(footprintFor('md', 'pdf') / 3);

    const file = (mb: number) => {
      const handle = new File(['x'], 'notes.md');
      Object.defineProperty(handle, 'size', { value: mb * MB });
      return handle;
    };

    expect(sizeCaution(file(8), 'md', 'txt', { limits: ios })).toBeUndefined();
    expect(sizeCaution(file(8), 'md', 'pdf', { limits: ios })).toBeDefined();
  });
});
