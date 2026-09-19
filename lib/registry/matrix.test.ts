import { describe, expect, it } from 'vitest';
import { FORMATS } from './formats';
import { find } from './routing';
import { isUnsupported } from './unsupported';
import { cellFor, matrix, totals } from './matrix';

describe('the support matrix', () => {
  it('has a cell for every ordered pair', () => {
    const rows = matrix();
    expect(rows).toHaveLength(FORMATS.length);
    expect(rows.flat()).toHaveLength(FORMATS.length * FORMATS.length);
  });

  it('agrees with the registry on every single cell', () => {
    // The matrix is a view, not a second opinion. If these ever disagree, the
    // page is telling people something the converter will not do.
    for (const from of FORMATS) {
      for (const to of FORMATS) {
        const cell = cellFor(from, to);
        const route = find(from, to);

        if (from === to) {
          expect(cell.kind).toBe('self');
          continue;
        }
        if (isUnsupported(from, to)) {
          expect(cell.kind, `${from} → ${to}`).toBe('refused');
          expect(cell.reason, `${from} → ${to} gave no reason`).toBeTruthy();
          continue;
        }
        if (!route) {
          expect(cell.kind, `${from} → ${to}`).toBe('refused');
          continue;
        }
        expect(cell.kind, `${from} → ${to}`).toBe(
          route.steps.length > 1 ? 'routed' : 'direct',
        );
        if (cell.kind === 'routed') expect(cell.via).toBe(route.via);
      }
    }
  });

  it('counts what the project says it converts', () => {
    // These are the headline numbers in CLAUDE.md and the README. Counting them
    // here is what stops the two drifting apart silently — if an edge is added
    // or removed, this fails and both get updated deliberately.
    expect(totals()).toEqual({
      formats: 14,
      pairs: 114,
      direct: 44,
      routed: 70,
      refused: 64,
    });
  });

  it('adds up: direct plus routed is every pair offered', () => {
    const counts = totals();
    expect(counts.direct + counts.routed).toBe(counts.pairs);
  });

  it('offers a reason for every refusal it shows', () => {
    const refused = matrix()
      .flat()
      .filter((cell) => cell.kind === 'refused');

    // The four that need three hops are unavailable without being refused, so
    // they are the only cells allowed to carry no sentence. See OPEN.md.
    const unexplained = refused.filter((cell) => !cell.reason);
    expect(unexplained.map((c) => `${c.from} → ${c.to}`).sort()).toEqual([
      'json → epub',
      'json → html',
      'json → odt',
      'json → rtf',
    ]);
  });
});
