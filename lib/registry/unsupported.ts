import { FAMILY } from './formats';
import type { Format } from './types';

export interface UnsupportedPair {
  from: Format;
  to: Format;
  reason: string;
}

/** One reason, written once, covering every pair it applies to. */
interface Rule {
  from: Format[];
  to: Format[];
  reason: string;
}

const TEXT = (Object.keys(FAMILY) as Format[]).filter((f) => FAMILY[f] === 'text');
const SHEET = (Object.keys(FAMILY) as Format[]).filter((f) => FAMILY[f] === 'sheet');
const SLIDES = (Object.keys(FAMILY) as Format[]).filter((f) => FAMILY[f] === 'slides');

/**
 * Pairs Kiln deliberately does not offer, and why.
 *
 * Written as rules rather than pairs because fourteen formats make 182 ordered
 * pairs, and a reason repeated eight times is a reason nobody maintains. The
 * rules expand to pairs at module load.
 *
 * Two kinds of refusal live here, and they are different:
 *
 * - **The output's value is its visual layout.** Rebuilding that means a layout
 *   and rendering engine — tens of megabytes in a browser, or a server, and
 *   sending the document to a server is the one thing Kiln will not do.
 * - **The conversion is an editorial judgement, not a conversion.** Splitting
 *   prose into slides, or finding the tables inside a document, is a decision
 *   about meaning. A converter that guesses produces something you have to redo,
 *   which is worse than being told no.
 *
 * This list is also what stops routing being too clever. A two-step path can
 * reach pairs nobody should be offered, so `routing.ts` checks here first.
 * Listing them is not an apology: the constraint that makes Kiln private is the
 * same constraint that limits it, and saying so plainly is more useful than a
 * disabled menu item.
 */
const RULES: Rule[] = [
  {
    from: TEXT,
    to: SHEET,
    reason:
      'Kiln will not guess which parts of a document are a table. Getting that wrong puts numbers in the wrong columns, and a spreadsheet that is subtly wrong is worse than no spreadsheet.',
  },
  {
    // `md` and `txt` are the exception, and deliberately so: a Markdown heading
    // is an explicit statement of where one slide ends and the next begins.
    // Prose carries no such marker, and inventing them is writing, not
    // converting. (`txt → md` is a byte-for-byte copy, so a .txt file is
    // Markdown as far as this is concerned.)
    from: TEXT.filter((f) => f !== 'md' && f !== 'txt'),
    to: SLIDES,
    reason:
      'Splitting prose into slides means deciding what deserves a slide, which is a writing task. Convert to Markdown first and put a heading where each slide should start — Kiln will honour those.',
  },
  {
    from: SLIDES,
    to: ['pdf'],
    reason:
      'A deck converted to PDF should look like the deck. Kiln reads slides as text, so what it could produce is a text document — not the slides — and rendering the real layout needs a full presentation engine, far too large to ship to a browser.',
  },
  {
    from: SLIDES,
    to: SHEET,
    reason:
      'A deck is not a grid. The text on a slide has no rows or columns to recover, so anything Kiln produced here would be invented.',
  },
  {
    from: SHEET,
    to: SLIDES,
    reason:
      'Turning a sheet into slides means deciding what deserves a slide. That is an editorial judgement, not a conversion.',
  },
  {
    from: SLIDES,
    to: SLIDES,
    reason:
      'Kiln reads a deck as text only, so it has no layout to carry across. You would get the words in a new file and lose every design decision in the original.',
  },
];

function expand(rules: Rule[]): UnsupportedPair[] {
  const pairs: UnsupportedPair[] = [];
  const seen = new Set<string>();

  for (const rule of rules) {
    for (const from of rule.from) {
      for (const to of rule.to) {
        const key = `${from}>${to}`;
        if (from === to || seen.has(key)) continue;
        seen.add(key);
        pairs.push({ from, to, reason: rule.reason });
      }
    }
  }

  return pairs;
}

export const unsupported: UnsupportedPair[] = expand(RULES);

const index = new Map(unsupported.map((pair) => [`${pair.from}>${pair.to}`, pair]));

/** Whether this pair is refused outright, whatever route might reach it. */
export function isUnsupported(from: Format, to: Format): boolean {
  return index.has(`${from}>${to}`);
}

/** The unsupported targets for one source format, if any. */
export function unsupportedFor(from: Format): UnsupportedPair[] {
  return unsupported.filter((pair) => pair.from === from);
}

export interface UnsupportedGroup {
  targets: Format[];
  reason: string;
}

/**
 * The unsupported targets for one format, gathered under the reason they share.
 *
 * One reason now covers several targets — a document cannot become any of the
 * four spreadsheet formats, for the same reason each time — and printing it
 * once per pair would be four identical paragraphs.
 */
export function unsupportedGroupsFor(from: Format): UnsupportedGroup[] {
  const groups = new Map<string, Format[]>();

  for (const pair of unsupportedFor(from)) {
    const targets = groups.get(pair.reason) ?? [];
    targets.push(pair.to);
    groups.set(pair.reason, targets);
  }

  return [...groups].map(([reason, targets]) => ({ reason, targets }));
}
