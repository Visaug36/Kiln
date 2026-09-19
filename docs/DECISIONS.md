# Decisions

Why Recast is the way it is, newest first. Git records what changed; this records
why, and — the part that matters most — **what was rejected and why**, so a
future session does not cheerfully re-propose something already ruled out.

An entry belongs here when reversing it would change the product, not just the
code. Bug fixes go in `.claude/skills/probe/references/known-bugs.md`; stage
narrative goes in `STAGES.md`; unresolved questions go in `OPEN.md`.

---

## 2026-09-19 — Warnings have a severity, and progress has a number

### Severity is set where the warning is written, never read off its wording

`ConversionResult.warnings` is `Warning[]`, not `string[]`. Each one is built
with `lost`, `changed` or `note` from `shared.ts`, at the point of loss. The
component groups on the field and never looks at the sentence.

The line between them is one question — what is different between the document
that went in and the one that came out? Something missing is `lost`; something
present in another shape is `changed`; something that describes how the
conversion works is a `note`. So a stylesheet that no longer applies is
`changed` (every word survived, differently dressed) while an image is `lost`.

**Rejected:** classifying in the component by matching words like "dropped" or
"not carried over". It was the smaller change and it fails in the worst
direction — the first rephrasing silently demotes a real loss to a note, and
nothing tells you. Thirty-odd warning sites was a one-time cost; a classifier
that drifts from its inputs is a permanent one.

**Rejected:** a fourth level. Three tiers map onto three treatments and three
answers to "did I lose anything". A fourth would need a rule nobody could state
in a sentence.

### `lost` never collapses, and notes start closed

Notes sit behind a native `<details>`. `lost` is always visible, always first.

**Rejected:** collapsing everything behind one "N warnings" disclosure, which
is tidier and is the whole bug: silent loss is what the warnings channel exists
to prevent, and a click is close enough to silent.

**Rejected:** a hand-built disclosure. `<details>` is keyboard-operable and
works with no JavaScript; a custom one would have to earn that back.

### The step a warning came from is a field, not a prefix on the sentence

`runRoute` used to write `.odt → .md: An image was not carried over`. It now
sets `warning.step` and leaves the message alone, so the interface can group by
severity first and still say which half lost what — and a warning's text stays
the text somebody wrote, which is what makes it assertable.

### Progress is structured; the words live in the interface

An engine reports `{ phase, unit, done, total }` and `lib/jobs/progress.ts`
turns that into "Reading page 3 of 12". `ConvertFn` gained an optional second
parameter, so the thirty-nine engines with nothing to say did not have to
change at all.

**Rejected:** engines reporting a ready-made sentence. Copy would end up spread
across every engine, and a progress bar would have to re-derive the numbers
from a string.

**Rejected:** reporting every page. A 500-page PDF is 500 structured clones and
500 renders for text nobody can read that fast. The worker throttles to 100 ms
and always sends the frame where the phase, step or unit changes.

### A reporting conversion is not a wedged one

The runner kills a job that has not settled in sixty seconds. Each progress
message now restarts that clock, because the timeout is there for an engine
that has stopped, and a PDF visibly on page 300 has not stopped. Silence after
the last report still ends it.

### `firing` became `converting`

The state name was a kiln's word for it. The interface no longer shows a state
name at all — it shows what the worker is doing.

### Advice is only given to a reader who can take it

Four warnings gave instructions about a file the reader never had. The worst
was `* → epub`'s "Add `#` headings to split it up", shown on eleven routed
pairs where Recast wrote the Markdown itself. All four now state the outcome
and stop.

**Rejected:** keeping the advice and showing it only on the direct pair. The
interface would have to carry a second version of every sentence, and the
version people actually needed would be the one nobody tested.

`lib/registry/composed-copy.test.ts` is the standing check, running real
engines over real fixtures. Three sentences that name Markdown were left
alone deliberately: `Block` has no image kind, so no reader can emit `![]()`,
and those lines can only ever be read by somebody who dropped Markdown. The
reasoning is in a comment at each one, because the next person will otherwise
either "fix" them or trust them without checking.

---

## 2026-09-19 — Five controls: three built, two cut

The design carried a language switcher, a "Conversion guide" nav item, "See the
full matrix", "Report a problem" and an About link. Most had nothing behind
them. A control that looks live and does nothing is worse than no control, so
each was either built or removed.

### Built: the full matrix, at `/matrix`

All 182 ordered pairs, worked out from the registry at build time — 44 direct,
70 routed, 64 refused with their reasons, and four that simply need three hops.
It is a server component, so it ships no JavaScript of its own.

Every number on it is counted, never written down. `lib/registry/matrix.ts`
walks the registry and `matrix.test.ts` asserts the totals against the numbers
in `CLAUDE.md`, so adding an edge either updates both or fails.

**Rejected:** a hand-written table, which is a third copy of the matrix to keep
in step with `table.ts` and the routing snapshot.

**Rejected:** linking to the README's matrix on GitHub instead. It is the same
information a click away on somebody else's site, and it goes stale on its own.

### Built: "Report a problem" and About

"Report a problem" is a link to the repository's issues. About is an in-page
section with what Recast is, what it refuses and why, and a link to the source.
Both are one anchor each, and an anchor a person clicks is not a request the
page makes, so neither costs the privacy promise anything.

### Cut: the language switcher

**Rejected outright.** Five languages that do nothing is a worse interface than
one language honestly. Localisation is a stage — string extraction, a catalogue,
translated warnings and caveats, and somebody who reads each language to check
the output — not a dropdown.

### Cut: the "Conversion guide" nav item

There is no guide, and writing one is its own piece of work. What somebody
clicking it actually wants — what converts to what, and why the rest does not —
is on `/matrix`, which exists. A second nav item pointing at the same answer
would be the dead control this rule is about.

### `trailingSlash: true`, so a route resolves on any static host

Adding `/matrix` exposed an ambiguity that had never mattered with one page.
The export wrote `matrix.html` _and_ a `matrix/` directory holding only RSC
payloads, so whether `/matrix` resolved depended on how a host broke that tie.
GitHub Pages guesses well; a host that looks for `matrix/index.html` and stops
serves a 404 on a link the site itself prints.

`trailingSlash: true` writes `matrix/index.html` and removes the question.
`pnpm verify:browser` found this on its first run, before it could ship.

**Rejected:** relying on GitHub Pages resolving `/matrix` to `matrix.html`. It
does, and this repo has already shipped one green deploy over a broken site;
host-specific behaviour is not where the next one should come from.

### `verify:browser` walks the interface's own links

It collects every `<a href>` on each page, follows the internal ones against the
built export, and checks that each in-page anchor names an element that is
really there. It reads the links off the page rather than from a list kept
beside them, so a route added or removed shows up without anybody remembering.

Its first run found the `/matrix` 404 above. Its second found a bug in itself:
dead links were being added to the conversion-failure counter, so the summary
read "112/114 pairs converted" when all 114 had converted and two links were
dead. The counters are separate now — a number that reads as one thing and
means another is the failure this whole script exists to prevent.

---

## 2026-09-18 — Kiln became Recast

### The product is named Recast

"Kiln" said firing: heat applied to a thing until it hardens. That is not what
this product does. A document arrives and leaves in a new form, and the name now
carries the identity — recasting a spell, which is where the purple and the staff
come from.

The rename is total: repository, package, wordmark, page title, the CSS classes
and custom properties, the worker's build directory, `RecastError`, the ODF
numbering style names, the fixture marker, `README.md`, `CLAUDE.md`, all three
files in `docs/`, and the `kiln-design` skill, which is now `recast-design`.

**Rejected:** renaming the interface and leaving the internals. A half-rename is
a codebase where a grep for the product's name misses most of it, and the
leftover identifiers are exactly what the next reader trips on.

**Rejected:** leaving the history in `docs/` under the old name. The stages and
the decisions are about this product, not a different one that used to exist,
and reading them with two names in play costs more than the accuracy is worth.
Git holds the pre-rename text for anyone who needs it.

### The published site is verified at its basePath, not assumed

Renaming the repository moves a GitHub Pages project site from `/Kiln` to
`/Recast`. The export bakes `basePath` into every asset URL at build time, so a
build carrying the old prefix publishes a page whose every script, stylesheet
and font 404s — while the workflow reports success, because nothing in it ever
asked the site a question.

Three things now close that gap:

- The workflow reads the prefix from `GITHUB_REPOSITORY`, which every trigger
  sets, rather than from the event payload, which not all of them carry. The
  comment claimed this already; the code did not.
- It echoes the prefix, and then greps the built `out/index.html` for it. Same
  shape as the `.nojekyll` guard: assert the artifact, not the intent.
- `pnpm verify:browser` honours `NEXT_PUBLIC_BASE_PATH`, serving the export
  under the same prefix a project site uses and failing on any 404. Running it
  at `/Recast` reproduces the published site before it is published.

**Rejected:** opening the deployed URL as the check. It is the last word, not
the first, and it only exists after a bad deploy has already gone out. Measured
here: serving the `/Recast` build at `/Kiln`, the page still renders the words
"Drop a document" from static HTML while 11 assets are missing and nothing
works. A person confirming the deploy by eye would have called that fine.

---

## 2026-09-17 — The repo's memory

### `docs/` holds the history; `CLAUDE.md` holds the rules and points at it

A fresh session was starting by rediscovering what had already been decided.
Cheap by default, deep on demand — the same shape as the skills. `CLAUDE.md`
gains a pointer table; `DECISIONS.md`, `STAGES.md` and `OPEN.md` carry the rest
and are read only when something needs them.

**Rejected:** putting the history in `CLAUDE.md`. It is read in full at the start
of every session, so every fact added there is paid for by every session that did
not need it.

### No hook enforces the end-of-stage docs update

Reconciling `docs/` is part of the definition of done, kept honest by the rule in
`CLAUDE.md` and the sequence in `release-check`.

**Rejected: a hook.** There is no observable event for "a stage ended" — that is
a judgement, not something the harness can see. `Stop` fires every turn while a
stage spans many, so it would nag on almost all of them and get disabled.
`PreToolUse` on `Bash` fires on every shell command to catch a once-per-stage
event, putting overhead on the hottest tool. Two better-targeted mechanisms
already exist, and a third would trade a rule people follow for a check people
disable.

**What would change it:** a hook event that fires on an explicit "stage
complete" signal rather than on a turn or a tool call.

### `CLAUDE.md`'s issue list was replaced with a pointer, not kept in both places

It duplicated `OPEN.md` from the day `OPEN.md` existed.

**Rejected:** keeping both, the short list for convenience and the long one for
detail. Two copies of an issue list is one copy that goes stale — and the stale
one would be the copy that is always in context.

### A script checks that documentation resolves; the ignore marker is deliberate

`scripts/check-links.mjs`, wired into `release-check` and into CI. `CLAUDE.md`
pointed at `docs/x2t-spike.md` for four stages while that file only existed on
another branch. The same shape as the false caveat: documentation asserting
something untrue about itself, where the only reader who would catch it is one
who did not get what they came for.

A candidate path is only checked when its first segment exists at the repo root,
or when it resolves relative to the file mentioning it.

**Rejected:** checking every path-shaped string. Recast's docs are full of paths
_inside_ a document archive — `word/document.xml`, `META-INF/`, `OEBPS/` — and a
checker that flagged those would need a list of exceptions that goes stale faster
than the thing it is guarding.

**Rejected:** an exception list alone for the one genuine false positive, a file
the docs tell you to _create_. `<!-- check-links: reason -->` sits on the line
instead: invisible when rendered, visible in a diff, which is the right way round
for something that silences a check.

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
hub on purpose — Recast reads a deck as text only, so no deck becomes another deck.

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

Japanese and Simplified Chinese as separate files, fetched from Recast's own origin
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
to anyone who does not read the script, which makes it the one failure mode Recast
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

### Fixtures are produced by real writers, in dialects Recast did not write

DOCX comes from the `docx` library, XLSX and ODS from SheetJS, ODT and ODP and
EPUB hand-written in LibreOffice's and real EPUB tooling's shape.

**Rejected:** generating fixtures from Recast's own writers. A reader tested only
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
decisively better than Recast on non-Latin text and decisively worse on tables,
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

**Rejected:** shipping a document to a server to read it — the one thing Recast
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
network, however good its output. A WASM blob or a font from Recast's own origin is
fine; a hosted rendering API is not. This one cannot be walked back.

### The browser-only constraint sets the format list

Pairs whose value is their visual layout need a rendering engine too large to
ship or a server Recast will not have. They are listed with reasons in the
interface.

**Rejected:** hiding them. The constraint that makes Recast private is the same one
that limits it, and a product that advertises the first while hiding the second
is not telling the truth. There is no waitlist and no "coming soon".

### No analytics, telemetry or third-party script — ever

Next.js build telemetry is disabled in the `dev` and `build` scripts. Fonts are
downloaded at build time and served from Recast's own origin, so opening the page
contacts no CDN.

### Static export to GitHub Pages

`output: 'export'`, so Next.js would refuse to build a route handler anyway — the
constraint is enforced by the toolchain, not only by discipline.

### The design is pinned

The tokens, Inter and the 250 ms `cubic-bezier(0.32, 0.72, 0, 1)` curve are
deliberate. If an installed skill or general best practice suggests otherwise,
Recast's tokens win.

**Rejected:** the common advice to avoid Inter as overused, which
`frontend-design` gives. Inter was chosen for this product.
