import { describe, expect, it } from 'vitest';
import { FORMATS, converters, find, targetsFor } from './index';
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

  it('loads stub engines that report they are not implemented', async () => {
    const converter = find('md', 'txt');
    const convert = await converter!.load();
    const file = new File(['# hi'], 'notes.md', { type: 'text/markdown' });
    await expect(async () => convert(file)).rejects.toThrow('Not implemented');
  });
});

describe('targetsFor', () => {
  it('lists the targets declared for a source format', () => {
    expect(targetsFor('docx')).toEqual(['pdf', 'md', 'txt']);
    expect(targetsFor('md')).toEqual(['pdf', 'docx', 'txt']);
    expect(targetsFor('txt')).toEqual(['pdf', 'docx', 'md']);
    expect(targetsFor('rtf')).toEqual(['md', 'txt']);
    expect(targetsFor('pdf')).toEqual(['md', 'txt']);
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
  });
});
