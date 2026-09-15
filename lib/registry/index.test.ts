import { describe, expect, it } from 'vitest';
import { FORMATS, converters, find, targetsFor, unsupported } from './index';
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
      const convert = await converter.load();
      expect(
        typeof convert,
        `${converter.from} → ${converter.to} did not load a function`,
      ).toBe('function');
    }
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
  it('lists the targets declared for a source format', () => {
    expect(targetsFor('docx')).toEqual(['pdf', 'md', 'txt', 'rtf']);
    expect(targetsFor('md')).toEqual(['pdf', 'docx', 'pptx', 'txt']);
    expect(targetsFor('txt')).toEqual(['pdf', 'docx', 'md']);
    expect(targetsFor('rtf')).toEqual(['md', 'txt']);
    expect(targetsFor('pdf')).toEqual(['md', 'txt']);
    expect(targetsFor('xlsx')).toEqual(['pdf', 'docx', 'csv', 'md', 'txt']);
    expect(targetsFor('csv')).toEqual(['xlsx', 'md', 'txt']);
    expect(targetsFor('pptx')).toEqual(['md', 'txt']);
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
  it('returns the converter for a declared pair', () => {
    const converter = find('pdf', 'txt');
    expect(converter).toMatchObject({ from: 'pdf', to: 'txt', fidelity: 'lossy' });
  });

  it('returns undefined for a pair that is not declared', () => {
    expect(find('pdf', 'docx')).toBeUndefined();
    expect(find('md', 'rtf')).toBeUndefined();
    expect(find('txt', 'txt')).toBeUndefined();
    expect(find('pptx', 'pdf')).toBeUndefined();
    expect(find('xlsx', 'pptx')).toBeUndefined();
  });
});
