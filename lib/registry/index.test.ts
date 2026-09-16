import { describe, expect, it } from 'vitest';
import { FORMATS, converters, find, targetsFor, unsupported } from './index';
import { engineFor, engines } from './engines';
import type { Format } from './types';

describe('the registry table', () => {
  it('declares every pair exactly once', () => {
    const pairs = converters.map((c) => `${c.from}>${c.to}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('never converts a format to itself', () => {
    expect(converters.filter((c) => c.from === c.to)).toEqual([]);
  });

  it('only uses formats Kiln knows about', () => {
    for (const converter of converters) {
      expect(FORMATS).toContain(converter.from);
      expect(FORMATS).toContain(converter.to);
    }
  });

  it('gives every lossy converter a caveat', () => {
    for (const converter of converters.filter((c) => c.fidelity === 'lossy')) {
      expect(converter.caveat, `${converter.from} → ${converter.to}`).toBeTruthy();
    }
  });

  it('loads a real engine for every declared pair', async () => {
    for (const converter of converters) {
      const load = engineFor(converter.from, converter.to);
      expect(load, `${converter.from} → ${converter.to} has no engine`).toBeDefined();

      const convert = await load!();
      expect(
        typeof convert,
        `${converter.from} → ${converter.to} did not load a function`,
      ).toBe('function');
    }
  });

  // The table and the engine map are separate modules now — the table is
  // reached from the page, the engines only from the worker — so nothing but a
  // test stops them drifting apart.
  it('has an engine for every declared pair and no engine without one', () => {
    const declared = new Set(converters.map((c) => `${c.from}>${c.to}`));
    const implemented = new Set(Object.keys(engines));

    expect(
      [...declared].filter((k) => !implemented.has(k)),
      'declared but no engine',
    ).toEqual([]);
    expect(
      [...implemented].filter((k) => !declared.has(k)),
      'engine but not declared',
    ).toEqual([]);
  });

  it('never declares a pair that is also on the unsupported list', () => {
    for (const pair of unsupported) {
      expect(
        find(pair.from, pair.to),
        `${pair.from} → ${pair.to} is both supported and unsupported`,
      ).toBeUndefined();
    }
  });

  it('gives every unsupported pair a reason', () => {
    for (const pair of unsupported) {
      expect(pair.reason.length, `${pair.from} → ${pair.to}`).toBeGreaterThan(20);
    }
  });
});

describe('targetsFor', () => {
  // The full matrix, direct and routed alike, is snapshotted in
  // `routing.test.ts`. These are the shapes worth naming out loud.
  it('offers everything reachable, not only the direct neighbours', () => {
    // Every text format reaches every other one, through Markdown.
    expect(targetsFor('md')).toEqual([
      'pdf',
      'docx',
      'odt',
      'rtf',
      'html',
      'epub',
      'txt',
      'pptx',
      'odp',
    ]);
    expect(targetsFor('epub')).toEqual([
      'pdf',
      'docx',
      'odt',
      'rtf',
      'html',
      'md',
      'txt',
    ]);
    // A deck is read out as text, and never becomes another deck.
    expect(targetsFor('pptx')).not.toContain('odp');
    // A spreadsheet never becomes a deck, and a document never becomes a grid.
    expect(targetsFor('xlsx')).not.toContain('pptx');
    expect(targetsFor('docx')).not.toContain('csv');
  });

  it('returns targets in canonical order, not table order', () => {
    for (const from of FORMATS) {
      const targets = targetsFor(from);
      const positions = targets.map((t) => FORMATS.indexOf(t));
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
  });

  it('never offers a format as its own target', () => {
    for (const from of FORMATS) {
      expect(targetsFor(from)).not.toContain(from);
    }
  });

  it('returns an empty list for a format with no converters', () => {
    const orphan = 'xyz' as Format;
    expect(targetsFor(orphan)).toEqual([]);
  });

  it('agrees with find for every listed target', () => {
    for (const from of FORMATS) {
      for (const to of targetsFor(from)) {
        expect(find(from, to)).toBeDefined();
      }
    }
  });
});

describe('find', () => {
  it('returns a one-step route for a declared pair', () => {
    expect(find('pdf', 'txt')).toMatchObject({
      from: 'pdf',
      to: 'txt',
      fidelity: 'lossy',
      via: undefined,
    });
    expect(find('pdf', 'txt')!.steps).toHaveLength(1);
  });

  it('returns a two-step route for a pair only a path can reach', () => {
    expect(find('epub', 'docx')).toMatchObject({ via: 'md' });
    expect(find('ods', 'json')).toMatchObject({ via: 'xlsx' });
  });

  it('returns undefined for a pair Kiln will not do', () => {
    expect(find('txt', 'txt')).toBeUndefined();
    expect(find('pptx', 'pdf')).toBeUndefined();
    expect(find('xlsx', 'pptx')).toBeUndefined();
    expect(find('pdf', 'xlsx')).toBeUndefined();
    expect(find('docx', 'pptx')).toBeUndefined();
    // Three hops is not a pair. JSON reaches its own family and the four text
    // targets Excel reaches directly; an ebook is one conversion further off.
    expect(find('json', 'epub')).toBeUndefined();
  });
});
