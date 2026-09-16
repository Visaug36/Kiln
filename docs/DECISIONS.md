# Decisions

Why Kiln is the way it is, newest first. Git records what changed; this records
why, and — the part that matters most — **what was rejected and why**, so a
future session does not cheerfully re-propose something already ruled out.

An entry belongs here when reversing it would change the product, not just the
code. Bug fixes go in `.claude/skills/probe/references/known-bugs.md`; stage
narrative goes in `STAGES.md`; unresolved questions go in `OPEN.md`.

---

## 2026-09-16 — Routing and the six new formats

### The registry declares edges and computes pairs

Fourteen formats is 182 ordered pairs. `table.ts` declares 44 one-step
converters; `routing.ts` composes at most two into a `Route`, giving 114 pairs.
A new format needs a reader to its family's hub and a writer from it, not a row
of the matrix.

**Rejected:** a converter per pair. It is 182 engines, 182 caveats to keep true,
and every shared bug fixed 182 times.

### A hub per family, and at most two hops

Markdown is the hub for text documents, Excel for spreadsheets. Slides have no
hub on purpose — Kiln reads a deck as text only, so no deck becomes another deck.

**Rejected:** three or more hops. The loss compounds past usefulness and each
step is a whole file written and parsed again. Four pairs are unreachable as a
result (`json` to `odt`, `rtf`, `html`, `epub`) and that is the accepted cost.

### A routed path crosses a family boundary at most once

A spreadsheet read out as prose is an honest reduction. Re-inflating that prose
into a grid is not — the second step invents the structure the first destroyed.

**Rejected:** routing anything into a spreadsheet. `pdf → md → xlsx` is
technically a path and completely useless. There is no text-to-sheet converter at
all, so the rule is enforced by the graph as well as by `unsupported.ts`.

### Route ranking prefers the hub over better-looking fidelity

`rtf → txt` is `good` and `rtf → md` is `lossy` — one promises only the words,
the other promises headings it had to guess at.

**Rejected:** ranking on fidelity alone, which was the first implementation. It
routed `rtf → pdf` through plain text and arrived with every heading and bullet
flattened: the label that admitted to less won by admitting to less.

### `pdf → docx` and `pptx → docx` are offered; `pptx → pdf` stays refused

The first two were refused for being guesswork while `pdf → md` and `pptx → md`
were offered — the same guesswork, disclosed. Output was read back before
deciding: both produce real, useful documents.

**Rejected:** un-refusing `pptx → pdf` alongside them. The difference is
expectation. Someone asking for that wants printable slides, and a prose PDF is a
worse answer than none.

### ODS shares XLSX's engines rather than copying them

SheetJS reads both and the engines work on rows, so five of ODS's six edges point
at existing modules. Declaring the edges recorded a capability that already
existed.

**Rejected:** leaving them out to keep the edge count down. That would have
offered `xlsx → odt` while refusing `ods → odt` — the sibling drift this
codebase has been bitten by four times.

### `md → html` renders through marked, not the block model

HTML is the one target that can express inline emphasis and links exactly, and
the block model deliberately does not carry inline runs. Going through it would
throw away bold, italics and links the source spells out.

**Rejected:** consistency for its own sake. Every other writer goes through
blocks; this one has a reason not to, and its caveat says so.

### Inline emphasis stops at the hub, and the caveats say so

Every reader carries bold, italics and links into Markdown. Every writer except
HTML drops them. This was discovered as a false caveat, not a missing feature:
`md → docx` had claimed links map to Word styles for three stages.

**Rejected:** carrying inline runs through the block model now. It touches six
writers and is a much larger job than it looks. Recorded as a known limit in
`OPEN.md` and stated on each affected pair.

### Memory multipliers are keyed on the edge, composed per route

A hundred pairs would be a hundred numbers drifting out of step with the
engines beneath them. A route's cost is the larger peak of its two steps, with
the second scaled by how much the first grew the file.

**Rejected:** per-pair measurement, which is what the previous stage did when
there were 25 pairs and would not survive 114.

---

## 2026-09-16 — Closing out functionality

### CJK ships as two lazy faces, in TTF

Japanese and Simplified Chinese as separate files, fetched from Kiln's own origin
only when a document contains those scripts.

**Rejected:** a pan-CJK face (three to four times the size, and almost nobody
needs both). **Rejected:** woff2, which halves the download but goes down a
fontkit path pdfkit cannot subset — the same test document came out at 2988 KB
against 14 KB for the TTF. The download happens once a session; the bloat would
happen in every file a person keeps.

### Font coverage is read from the font's own `cmap`, never a table

A generated coverage table would be 27 KB of string per face and free to drift
from the file it describes. The runtime read matches fontTools exactly on both
faces.

### Right-to-left is refused until someone who reads it can check

fontkit can shape Arabic, but nothing in the stack implements the Unicode
bidirectional algorithm.

**Rejected:** shipping it anyway and warning. A bidi bug looks entirely correct
to anyone who does not read the script, which makes it the one failure mode Kiln
cannot self-verify.

### Korean is refused rather than given a third font

Neither shipped face carries a hangul syllable. Adding a third is a decision
about download size, not an oversight, and it is recorded as one.

### Silent loss is a bug: `htmlToBlocks` gained a warnings channel

Two open bugs — the images warning that never fired, and merged cells becoming a
phantom empty column — turned out to be the same gap: the layer between readers
and writers returned `Block[]` and had nowhere to put a warning.

**Rejected:** reporting a fixed list of tags. The stranded-text check reports the
words that reached no block instead, so it catches whatever a reader starts
emitting next without a list anybody has to remember to extend.

---

## 2026-09-15 — Operating instructions and hooks

### The repo commits its own hooks, calling only its own package scripts

`.claude/settings.json` is committed: typecheck after every edit, tests and
bundle budget when a turn ends.

**Rejected:** anything touching the network, a third-party service or a proxy.
Cloning the repo means running these, so they may only run what the repo already
runs itself.

### Skills are a lean `SKILL.md` plus `references/`

Only the name and description load at startup; the body loads on trigger and
`references/` costs nothing until read. The description **is** the trigger — a
vague one means the skill silently never fires.

**Rejected:** short skills. An earlier instruction to keep every skill brief
produced thin ones that said nothing a reader could act on.

### Never `git add -A` while a subagent is running

A verification subagent writes throwaway probes into the repo while it works, and
a blanket add swept one into a commit — eight tests with no assertions that could
never fail, pushed unread.

---

## 2026-09-15 — Correctness

### A PDF with nothing renderable is refused, not written

Base-14 PDF fonts use single-byte WinAnsi encoding, so anything above U+00FF was
silently mojibake. Text a font cannot draw is now replaced and named in
`warnings`, and a document with nothing left is refused outright.

**Rejected:** rendering it and hoping. Silent mojibake is the bug that check was
written for; never let it be bypassed.

### Fixtures are produced by real writers, in dialects Kiln did not write

DOCX comes from the `docx` library, XLSX and ODS from SheetJS, ODT and ODP and
EPUB hand-written in LibreOffice's and real EPUB tooling's shape.

**Rejected:** generating fixtures from Kiln's own writers. A reader tested only
against its matching writer proves nothing except that the two agree with each
other.

---

## 2026-09-15 — The x2t spike

### x2t is deferred, not rejected, pending two answers

Nothing under `lib/registry/` was touched. Branch `spike/x2t-wasm`, write-up at
`docs/x2t-spike.md` **on that branch**.

Two things have to land before any integration: a **built size measurement**
(the build needs Docker and ~20 GB; it was not possible in the sandbox) and the
**AGPL-3.0 decision**, which is the only irreversible part. See `OPEN.md`.

**Rejected:** adopting broadly. At this size it cannot replace mammoth or
SheetJS, which cost tens to hundreds of kilobytes.

### office2pdf is not a substitute

Measured properly: 47.8 MB raw, 11.7 MB brotli, sub-second conversion. It is
decisively better than Kiln on non-Latin text and decisively worse on tables,
which are commoner, and it breaks `fi` ligatures. It solves exactly one of the
refused pairs.

**Rejected** as a `docx → pdf` replacement. Kept in mind for one narrow purpose.

---

## 2026-09-15 — The engines

### The registry table is split from the engine map

`table.ts` is reached from the page and contains no `import()` at all; every
dynamic import lives in `engines.ts`, which only the worker imports.

**Rejected:** one module. A dynamic `import()` in a module the page reaches makes
the bundler emit a chunk per engine — about 4 MB built, deployed, and never
fetched, because conversions happen in the worker.

### Conversion runs in a Web Worker, one job at a time

**Rejected:** parallelism. Every engine holds the whole document in memory; two
at once doubles the peak on the platform least able to afford it.

### Detection reads magic bytes, not extensions

The page decides only "is this an archive"; the worker opens it and says which
kind. Seven of the fourteen formats are a ZIP underneath.

**Rejected:** identifying archives on the page. It would put a second copy of
JSZip in the page bundle for everyone who drops an Office file.

### RTF, PPTX and ODF are walked by hand

Every maintained RTF parser on npm is a Node binding or a wrapper around a native
converter, and neither runs in a tab. There is no browser-sized OpenDocument or
PPTX library either.

**Rejected:** shipping a document to a server to read it — the one thing Kiln
will not do.

### The entry chunk budget is 200 KB gzipped, enforced in CI

Engine size is deliberately **not** counted against it, and is never a reason to
reject a good engine: engines load on demand and only when used.

---

## 2026-09-14 — The shape of the product

### Everything runs client-side; there is no server

This is the product, not a feature of it. People convert contracts, medical
letters and drafts they have not shown anyone. No route handlers, no middleware,
no server actions, no database.

**Rejected:** any library, dependency or code path that puts file contents on the
network, however good its output. A WASM blob or a font from Kiln's own origin is
fine; a hosted rendering API is not. This one cannot be walked back.

### The browser-only constraint sets the format list

Pairs whose value is their visual layout need a rendering engine too large to
ship or a server Kiln will not have. They are listed with reasons in the
interface.

**Rejected:** hiding them. The constraint that makes Kiln private is the same one
that limits it, and a product that advertises the first while hiding the second
is not telling the truth. There is no waitlist and no "coming soon".

### No analytics, telemetry or third-party script — ever

Next.js build telemetry is disabled in the `dev` and `build` scripts. Fonts are
downloaded at build time and served from Kiln's own origin, so opening the page
contacts no CDN.

### Static export to GitHub Pages

`output: 'export'`, so Next.js would refuse to build a route handler anyway — the
constraint is enforced by the toolchain, not only by discipline.

### The design is pinned

The tokens, Inter and the 250 ms `cubic-bezier(0.32, 0.72, 0, 1)` curve are
deliberate. If an installed skill or general best practice suggests otherwise,
Kiln's tokens win.

**Rejected:** the common advice to avoid Inter as overused, which
`frontend-design` gives. Inter was chosen for this product.
