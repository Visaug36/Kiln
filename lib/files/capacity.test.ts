import { afterEach, describe, expect, it, vi } from 'vitest';
import { FOOTPRINT, capacity, sizeCaution, type Capacity } from './capacity';

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
    expect(sizeCaution(file(0.2), 'docx', { limits: desktop })).toBeUndefined();
    expect(sizeCaution(file(1, 'notes.txt'), 'txt', { limits: ios })).toBeUndefined();
  });

  it('warns on a file the same browser could not hold', () => {
    const caution = sizeCaution(file(25, 'big.txt'), 'txt', { limits: ios });

    expect(caution).toBeDefined();
    expect(caution!.estimate).toBe(25 * MB * FOOTPRINT.txt);
  });

  it('warns sooner on a phone than on a computer', () => {
    // The whole point of the split: a file that is fine on a laptop is not
    // necessarily fine on an iPhone, and iOS gives no second chance.
    const modest = file(0.5);

    expect(sizeCaution(modest, 'docx', { limits: desktop })).toBeUndefined();
    expect(sizeCaution(modest, 'docx', { limits: ios })).toBeDefined();
  });

  it('says it is a guess, and says what to do instead', () => {
    const message = sizeCaution(file(4), 'docx', { limits: desktop })!.message;

    expect(message).toMatch(/estimate|may/i);
    expect(message).toMatch(/rather than a measurement/i);
    expect(message).toMatch(/desktop browser|smaller file/i);
  });

  it('explains the iOS failure rather than blaming the file', () => {
    const message = sizeCaution(file(4), 'docx', { limits: ios })!.message;

    expect(message).toMatch(/without an error|closes/i);
    expect(message).not.toMatch(/!/); // Kiln's copy has no exclamation marks.
  });

  it('measures an archive by what it unpacks to, not by its file size', () => {
    // A 1 MB DOCX of plain text unpacks to tens of megabytes. Judging it by the
    // compressed size said nothing; judging it by a fixed ratio guessed wrong
    // in both directions.
    const small = file(1);

    const byRatio = sizeCaution(small, 'docx', { limits: ios });
    const byTruth = sizeCaution(small, 'docx', { expandedSize: 40 * MB, limits: ios });

    expect(byTruth!.estimate).toBe(40 * MB * FOOTPRINT.docx);
    expect(byTruth!.estimate).toBeGreaterThan(byRatio!.estimate);
  });

  it('does not over-count an archive that is mostly already-compressed images', () => {
    // 20 MB of JPEGs in a .docx barely expands, so the assumed ratio guesses
    // far too high. Knowing the real figure pulls the estimate back down.
    const photos = file(20);

    const guessed = sizeCaution(photos, 'docx', { limits: desktop })!;
    const known = sizeCaution(photos, 'docx', {
      expandedSize: 21 * MB,
      limits: desktop,
    })!;

    expect(known.estimate).toBeLessThan(guessed.estimate);
  });

  it('has a footprint for every format the registry knows', async () => {
    const { FORMATS } = await import('@/lib/registry');
    for (const format of FORMATS) {
      expect(FOOTPRINT[format], `${format} has no footprint`).toBeGreaterThan(0);
    }
  });
});
