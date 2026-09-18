import { FAMILY, FORMATS, FORMAT_LABEL, HUB } from './formats';
import { converters } from './table';
import { isUnsupported } from './unsupported';
import type { Converter, Fidelity, Format, Route } from './types';

/** Worst-first, so a path's fidelity is the highest rank in it. */
const RANK: Record<Fidelity, number> = { exact: 0, good: 1, lossy: 2 };

const BY_PAIR = new Map(converters.map((c) => [`${c.from}>${c.to}`, c]));

const OUT = new Map<Format, Converter[]>();
for (const converter of converters) {
  const list = OUT.get(converter.from) ?? [];
  list.push(converter);
  OUT.set(converter.from, list);
}

/** The declared one-step converter for a pair, if there is one. */
export function edge(from: Format, to: Format): Converter | undefined {
  return BY_PAIR.get(`${from}>${to}`);
}

/**
 * How many times a path leaves one family for another.
 *
 * A single crossing is an honest reduction — a spreadsheet read out as a table
 * in prose, a deck read out as an outline — and Recast already ships direct
 * converters that do exactly that. Two crossings is not: a deck flattened into
 * Markdown and then re-inflated into a spreadsheet is technically a conversion
 * and completely useless, because the second step has to invent the structure
 * the first one destroyed.
 */
function crossings(path: Format[]): number {
  let count = 0;
  for (let i = 1; i < path.length; i += 1) {
    if (FAMILY[path[i - 1]!] !== FAMILY[path[i]!]) count += 1;
  }
  return count;
}

function worst(steps: Converter[]): Fidelity {
  return steps.reduce<Fidelity>(
    (acc, step) => (RANK[step.fidelity] > RANK[acc] ? step.fidelity : acc),
    'exact',
  );
}

/**
 * The note a routed pair carries on top of its steps' own caveats.
 *
 * Worth saying plainly, because the two-step shape is the thing a person cannot
 * see: the first step writes a real file in the intermediate format and the
 * second one reads it back, so anything the first step could not express is
 * already gone when the second starts.
 */
function viaNote(via: Format): string {
  return `Recast converts this in two steps, through ${FORMAT_LABEL[via]}. Whatever the first step cannot carry is gone before the second one runs.`;
}

function toRoute(from: Format, to: Format, steps: Converter[]): Route {
  const via = steps.length > 1 ? steps[0]!.to : undefined;

  const caveats: string[] = [];
  if (via) caveats.push(viaNote(via));
  for (const step of steps) {
    if (step.caveat && !caveats.includes(step.caveat)) caveats.push(step.caveat);
  }

  return { from, to, steps, fidelity: worst(steps), caveats, via };
}

/**
 * How Recast will perform a pair: one converter, or two run back to back.
 *
 * A direct converter always wins, even where a path also exists — it was
 * written for this pair and a path was not. Beyond that, paths are ranked by
 * fidelity and then by the intermediate's position in `FORMATS`, so the same
 * pair always resolves the same way.
 *
 * Three hops are not attempted. The loss compounds past the point of
 * usefulness, and each step is a whole file written and parsed again.
 */
export function find(from: Format, to: Format): Route | undefined {
  if (from === to) return undefined;
  if (isUnsupported(from, to)) return undefined;

  const direct = edge(from, to);
  if (direct) return toRoute(from, to, [direct]);

  let best: Converter[] | undefined;
  let bestKey: Key | undefined;

  for (const first of OUT.get(from) ?? []) {
    const via = first.to;
    if (via === to || via === from) continue;

    const second = edge(via, to);
    if (!second) continue;

    const path = [from, via, to];
    if (crossings(path) > 1) continue;

    const steps = [first, second];
    const key: Key = [
      crossings(path),
      HUB[FAMILY[via]] === via ? 0 : 1,
      RANK[worst(steps)],
      FORMATS.indexOf(via),
    ];

    if (!bestKey || compare(key, bestKey) < 0) {
      best = steps;
      bestKey = key;
    }
  }

  return best ? toRoute(from, to, best) : undefined;
}

/**
 * How two candidate paths are ranked: fewest family crossings, then the hub,
 * then fidelity, then the intermediate's place in `FORMATS` so that the same
 * pair always resolves the same way.
 *
 * The hub outranks fidelity, which looks wrong until you see what fidelity is
 * a claim about. `rtf → txt` is `good` and `rtf → md` is `lossy`, because the
 * plain-text pair only promises the words while the Markdown pair promises
 * headings it had to guess at. Ranked on that alone, `rtf → pdf` would route
 * through plain text and arrive with every heading and bullet flattened — the
 * label that admits to less would have won by admitting to less. The hub is the
 * richest format in its family; that is why it is the hub, and why a path
 * through it carries the most across.
 */
type Key = [number, number, number, number];

function compare(a: Key, b: Key): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3];
}

/** Every format `from` can become, in canonical order. Drives the format picker. */
export function targetsFor(from: Format): Format[] {
  return FORMATS.filter((to) => to !== from && find(from, to) !== undefined);
}

/** Every pair Recast offers, for tests and for the support matrix. */
export function allRoutes(): Route[] {
  const routes: Route[] = [];
  for (const from of FORMATS) {
    for (const to of FORMATS) {
      const route = find(from, to);
      if (route) routes.push(route);
    }
  }
  return routes;
}
