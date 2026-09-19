import { describe, expect, it } from 'vitest';
import { announceProgress, describeProgress } from './progress';

describe('what a converting row says', () => {
  it('says nothing before the worker has reported', () => {
    // The row prints "Converting" beside this, so a fallback that repeats the
    // word reads as "Converting… Converting".
    expect(describeProgress(undefined, 'pdf')).toBe('');
  });

  it('names the page it is on', () => {
    expect(
      describeProgress({ phase: 'reading', unit: 'page', done: 3, total: 12 }, 'md'),
    ).toBe('Reading page 3 of 12');
  });

  it('counts whatever the engine counts', () => {
    expect(
      describeProgress({ phase: 'reading', unit: 'sheet', done: 1, total: 4 }, 'csv'),
    ).toBe('Reading sheet 1 of 4');
    expect(
      describeProgress({ phase: 'reading', unit: 'chapter', done: 2, total: 9 }, 'md'),
    ).toBe('Reading chapter 2 of 9');
  });

  it('says what it is writing, using the target the row already shows', () => {
    expect(describeProgress({ phase: 'writing' }, 'pdf')).toBe('Writing the .pdf');
  });

  it('degrades to the phase when an engine cannot count', () => {
    expect(describeProgress({ phase: 'reading' }, 'txt')).toBe('Reading the file');
  });

  it('says which step of a routed conversion it is on', () => {
    expect(
      describeProgress(
        { phase: 'reading', unit: 'page', done: 5, total: 40, step: 1, steps: 2 },
        'docx',
      ),
    ).toBe('Step 1 of 2 · Reading page 5 of 40');
  });

  it('leaves the step out when there is only one', () => {
    // A direct pair is not "step 1 of 1"; that is noise dressed as precision.
    expect(
      describeProgress(
        { phase: 'reading', unit: 'page', done: 5, total: 40, step: 1, steps: 1 },
        'md',
      ),
    ).toBe('Reading page 5 of 40');
  });
});

describe('what a screen reader hears', () => {
  it('drops the counter, so a long PDF is announced twice and not four hundred times', () => {
    const reading = { phase: 'reading', unit: 'page', total: 500 } as const;

    expect(announceProgress({ ...reading, done: 1 }, 'md')).toBe('Reading the file');
    expect(announceProgress({ ...reading, done: 499 }, 'md')).toBe('Reading the file');
    expect(announceProgress({ phase: 'writing' }, 'md')).toBe('Writing the .md');
  });
});
