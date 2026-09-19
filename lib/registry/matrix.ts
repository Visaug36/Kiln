import { FORMATS } from './formats';
import { find } from './routing';
import { isUnsupported, unsupported } from './unsupported';
import type { Format } from './types';

/**
 * The whole support matrix, worked out from the registry.
 *
 * Nothing here is a list anybody maintains. `table.ts` declares 44 edges,
 * `routing.ts` composes them and `unsupported.ts` refuses what it should not
 * reach; this walks all 182 ordered pairs and asks. Declaring one new edge
 * changes this page on its own, which is the same rule the format picker
 * follows and the reason neither can go stale.
 */

export type CellKind = 'self' | 'direct' | 'routed' | 'refused';

export interface Cell {
  from: Format;
  to: Format;
  kind: CellKind;
  /** The format a routed pair passes through. */
  via?: Format;
  /** Why a refused pair is refused. */
  reason?: string;
}

export function cellFor(from: Format, to: Format): Cell {
  if (from === to) return { from, to, kind: 'self' };

  if (isUnsupported(from, to)) {
    const reason = unsupported.find((p) => p.from === from && p.to === to)?.reason;
    return { from, to, kind: 'refused', reason };
  }

  const route = find(from, to);
  if (!route) {
    // Reachable only in three hops, and two is the rule. Not a refusal with a
    // reason of its own — see `OPEN.md` — but it is not offered either, so the
    // matrix has to show it as unavailable rather than quietly as a gap.
    return { from, to, kind: 'refused' };
  }

  return route.steps.length > 1
    ? { from, to, kind: 'routed', via: route.via }
    : { from, to, kind: 'direct' };
}

export function matrix(): Cell[][] {
  return FORMATS.map((from) => FORMATS.map((to) => cellFor(from, to)));
}

export interface MatrixTotals {
  formats: number;
  pairs: number;
  direct: number;
  routed: number;
  refused: number;
}

/** The headline numbers, counted rather than written down. */
export function totals(): MatrixTotals {
  const cells = matrix().flat();
  const direct = cells.filter((c) => c.kind === 'direct').length;
  const routed = cells.filter((c) => c.kind === 'routed').length;

  return {
    formats: FORMATS.length,
    pairs: direct + routed,
    direct,
    routed,
    // Counted from the refusal rules, so the four pairs that are simply out of
    // reach in two hops are not silently folded in with the deliberate ones.
    refused: unsupported.length,
  };
}
