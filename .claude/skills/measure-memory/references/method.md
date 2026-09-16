# The method, and the two ways it has been got wrong

## What the number is for

`sizeCaution` in `lib/files/capacity.ts` warns before a conversion starts, not
after it fails — because on iOS there is no after. A tab that runs out of memory
is killed outright: nothing throws, nothing is caught, the page simply
disappears. So the estimate is made from the file size, up front, and it never
blocks the conversion. It is a prediction, and the copy says so.

That is also why a _wrong_ number is worse than a rough one. Too high and it
cries wolf on files the browser handles comfortably, which trains people to
ignore it. Too low and it stays silent on the one that kills the tab.

---

## Failure 1 — readings taken without a forced collection

**What it looked like.** A clean-looking table where `docx → md` measured ×828
and `docx → txt` measured ×1. Nothing errored. Both numbers were plausible in
isolation.

**Why it is impossible.** Those two pairs share a reader. `readDocx` runs mammoth
over the same archive for both; they diverge only afterwards, and the divergence
is an HTML-to-blocks walk against an HTML-to-text walk. They cannot differ by
three orders of magnitude.

**The cause.** Two things, together:

- No `global.gc()` before the reading, so the baseline was whatever the previous
  edge had left on the heap.
- A sampler on a timer, which **cannot fire during a synchronous burst**. A
  conversion that never yields is never sampled, so its peak reads as its
  baseline.

**The fix.** Both halves:

```ts
if (!global.gc) throw new Error('run with NODE_OPTIONS=--expose-gc');

global.gc();
const before = process.memoryUsage().heapUsed;
let peak = before;
const watch = setInterval(() => {
  peak = Math.max(peak, process.memoryUsage().heapUsed);
}, 1);

const result = await convert(file);
// Before anything is collected, and before the result goes out of scope.
peak = Math.max(peak, process.memoryUsage().heapUsed);
clearInterval(watch);
```

The sampler catches conversions that yield — most do, at every `await`. The
reading taken the instant the conversion returns catches the ones that do not:
the garbage is still on the heap. Neither alone is trustworthy.

---

## Failure 2 — measuring against compressed bytes

**What it looked like.** Every ZIP-based format's multiplier came out several
times too large. `docx → md` at ×670, `ods → docx` at ×1000. Internally
consistent, and consistently wrong.

**The cause.** The measurement divided peak memory by the **file** size. But
`sizeCaution` multiplies by the **unpacked** size for the seven packed formats —
`sniffOoxml` reads it out of the archive's own headers while identifying it, and
OOXML compresses by a factor of ten or a hundred.

So a multiplier measured against a 200 KB `.docx` was then applied to the 3 MB of
XML inside it. Systematically wrong, for half the formats, in a direction nobody
would notice from the table alone.

**The fix.** Measure `content` the same way production does:

```ts
const PACKED = new Set<Format>(['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'epub']);

async function contentSize(file: File, format: Format): Promise<number> {
  if (!PACKED.has(format)) return file.size;
  // Sum uncompressedSize across the archive's entries.
}
```

**The general rule:** the measurement's denominator must be the same quantity
production multiplies. Anything else is a well-formed number for a different
question.

---

## Why edges and not pairs

There are 114 pairs and 44 edges. Measuring pairs would be a hundred numbers
drifting out of step with each other and with the engines beneath them — and the
whole point of the routing graph is that a pair is not a thing anybody wrote.

Each edge carries two numbers:

- **`peak`** — peak working memory as a multiple of the content it is given.
- **`growth`** — how much bigger the file it writes is than the content it read.

`growth` exists only because of routing. The second converter is handed the
first's _output_, not the original, so a route through a format that doubles the
file costs twice as much on the way out:

```ts
let worst = 0,
  scale = 1;
for (const step of route.steps) {
  const cost = EDGE_COST[`${step.from}>${step.to}`];
  worst = Math.max(worst, scale * cost.peak); // they run one after the other
  scale *= cost.growth; // …on a file the first one grew
}
```

The larger of the two peaks, never their sum — the steps never coexist. Adding
them would cry wolf on every routed pair.

---

## The inputs

Built, not collected. A fixture repeated until a parser chokes is not a document.

- **Text formats** — a fixture repeated to roughly 1.5 MB.
- **JSON** — one large array built programmatically, since repeating an array is
  not valid JSON.
- **Everything else** — produced by converting the large Markdown or CSV into it.
  A real document of a known size, written by Kiln's own writer.

This does mean the inputs are regular in a way real documents are not, which is
part of why these are order-of-magnitude figures. `md → pptx` measures a growth
of ×31 because a repeated fixture is thousands of `#` headings and therefore
thousands of slides; that figure is an artefact of the input and is only ever
used as a terminal step, where growth is not read.

---

## When a number is genuinely surprising

Do not round it away and do not paste it in. Either:

- **Explain it in the table.** `csv → xlsx` is the heaviest edge Kiln has at
  ×257, and the comment beside it says why: SheetJS builds a cell object per
  value and materialises the whole workbook XML as one string before zipping any
  of it. That is the library's shape, not a mistake, and saying so stops the next
  person treating it as a regression.
- **Or find the bug.** A surprise that cannot be explained usually is one — in
  the engine, or in the measurement, as both failures above were.

## After pasting the table in

```bash
pnpm test
```

`capacity.test.ts` fails if any declared edge has no measured cost, if the table
carries an edge the registry does not declare, or if `footprintFor` stops
composing routes the way the formula above says. Those three are the guard
against a table that has drifted from the graph.
