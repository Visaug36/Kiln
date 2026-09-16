import { describe, expect, it } from 'vitest';
import { FAMILY, FORMATS } from './formats';
import { allRoutes, edge, find, targetsFor } from './routing';
import { converters } from './table';
import { isUnsupported, unsupported } from './unsupported';
import type { Format } from './types';

/**
 * Routing is the part of the registry with no author.
 *
 * Every declared edge was written by hand and can be read; the pairs that fall
 * out of composing them were not, and there are more of them than edges. The
 * snapshot below is how a change to one edge that quietly adds or removes a
 * dozen pairs shows up in a diff rather than in a bug report.
 */

describe('the reachability matrix', () => {
  it('is exactly this, and a change to it is a change to the product', () => {
    const lines = FORMATS.map((from) => {
      const targets = targetsFor(from).map((to) => {
        const route = find(from, to)!;
        return route.via ? `${to}<-${route.via}` : to;
      });
      return `${from.padEnd(5)} (${FAMILY[from]}) → ${targets.join(' ')}`;
    });

    const routes = allRoutes();
    const direct = routes.filter((route) => route.steps.length === 1).length;

    expect(
      [
        `${routes.length} pairs: ${direct} direct, ${routes.length - direct} routed`,
        `${converters.length} declared edges, ${unsupported.length} refused pairs`,
        '',
        ...lines,
      ].join('\n'),
    ).toMatchSnapshot();
  });
});

describe('the rules that keep routing honest', () => {
  it('never builds a path longer than two steps', () => {
    for (const route of allRoutes()) {
      expect(route.steps.length, `${route.from} → ${route.to}`).toBeLessThanOrEqual(2);
    }
  });

  it('prefers a direct converter even where a path also exists', () => {
    // txt → md → docx is a valid path, and txt → docx is a declared converter.
    expect(find('txt', 'docx')?.steps).toHaveLength(1);
    expect(find('txt', 'docx')?.via).toBeUndefined();

    for (const converter of converters) {
      const route = find(converter.from, converter.to);
      expect(route?.steps, `${converter.from} → ${converter.to}`).toHaveLength(1);
    }
  });

  it('joins each step to the next', () => {
    for (const route of allRoutes()) {
      expect(route.steps[0]!.from).toBe(route.from);
      expect(route.steps.at(-1)!.to).toBe(route.to);
      if (route.steps.length === 2) {
        expect(route.steps[0]!.to).toBe(route.steps[1]!.from);
        expect(route.via).toBe(route.steps[0]!.to);
      }
    }
  });

  it('takes the worst fidelity in the path, not the first', () => {
    // pdf → md is lossy; md → docx is good. The pair is lossy.
    const route = find('pdf', 'docx')!;
    expect(route.steps.map((s) => s.fidelity)).toEqual(['lossy', 'good']);
    expect(route.fidelity).toBe('lossy');

    // txt → md is exact; md → pptx is good.
    expect(find('txt', 'pptx')!.fidelity).toBe('good');

    const rank = { exact: 0, good: 1, lossy: 2 };
    for (const route of allRoutes()) {
      const worst = Math.max(...route.steps.map((s) => rank[s.fidelity]));
      expect(rank[route.fidelity], `${route.from} → ${route.to}`).toBe(worst);
    }
  });

  it('shows both reasons when both steps have one', () => {
    const route = find('pdf', 'rtf')!;
    expect(route.via).toBe('md');
    // The note about the hand-off, then the two steps' own caveats.
    expect(route.caveats).toHaveLength(3);
    expect(route.caveats[0]).toContain('two steps, through Markdown');
    expect(route.caveats).toContain(edge('pdf', 'md')!.caveat);
    expect(route.caveats).toContain(edge('md', 'rtf')!.caveat);
  });

  it('never repeats the same caveat twice', () => {
    for (const route of allRoutes()) {
      expect(new Set(route.caveats).size, `${route.from} → ${route.to}`).toBe(
        route.caveats.length,
      );
    }
  });

  it('gives every route that is not exact something to say', () => {
    for (const route of allRoutes()) {
      if (route.fidelity === 'exact') continue;
      expect(route.caveats.length, `${route.from} → ${route.to}`).toBeGreaterThan(0);
    }
  });

  it('crosses a family boundary at most once', () => {
    for (const route of allRoutes()) {
      const path = [route.from, ...route.steps.map((step) => step.to)];
      let crossings = 0;
      for (let i = 1; i < path.length; i += 1) {
        if (FAMILY[path[i - 1]!] !== FAMILY[path[i]!]) crossings += 1;
      }
      expect(
        crossings,
        `${route.from} → ${route.to} via ${route.via}`,
      ).toBeLessThanOrEqual(1);
    }
  });

  it('will not route a document into a spreadsheet, however it is asked', () => {
    // The example that made the rule: pdf → md → xlsx is technically a path
    // and completely useless. There is no text → sheet converter at all, and
    // the refusal is recorded as well so the interface can say why.
    expect(find('pdf', 'xlsx')).toBeUndefined();
    expect(find('docx', 'csv')).toBeUndefined();
    expect(isUnsupported('pdf', 'xlsx')).toBe(true);
  });

  it('will not route prose into slides, but takes Markdown’s word for it', () => {
    expect(find('docx', 'pptx')).toBeUndefined();
    expect(find('odt', 'odp')).toBeUndefined();
    expect(find('epub', 'pptx')).toBeUndefined();

    // A heading is an explicit slide break, and `txt → md` is a byte copy.
    expect(find('md', 'pptx')?.steps).toHaveLength(1);
    expect(find('txt', 'pptx')?.via).toBe('md');
  });

  it('never offers a pair the unsupported list refuses', () => {
    for (const pair of unsupported) {
      expect(find(pair.from, pair.to), `${pair.from} → ${pair.to}`).toBeUndefined();
    }
  });

  it('never refuses a pair it also declares an edge for', () => {
    for (const converter of converters) {
      expect(
        isUnsupported(converter.from, converter.to),
        `${converter.from} → ${converter.to} is both declared and refused`,
      ).toBe(false);
    }
  });

  it('resolves the same pair the same way every time', () => {
    for (const from of FORMATS) {
      for (const to of FORMATS) {
        expect(find(from, to)?.via).toBe(find(from, to)?.via);
      }
    }
  });

  it('never converts a format to itself', () => {
    for (const format of FORMATS) {
      expect(find(format, format)).toBeUndefined();
      expect(targetsFor(format)).not.toContain(format);
    }
  });

  it('agrees with targetsFor in both directions', () => {
    for (const from of FORMATS) {
      const listed = new Set(targetsFor(from));
      for (const to of FORMATS) {
        expect(listed.has(to), `${from} → ${to}`).toBe(find(from, to) !== undefined);
      }
    }
  });

  it('has an unknown format reach nothing rather than throwing', () => {
    expect(targetsFor('xyz' as Format)).toEqual([]);
    expect(find('xyz' as Format, 'md')).toBeUndefined();
  });
});
