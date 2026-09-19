# Stages

How Recast got here, newest first. One entry per stage: **what shipped**, **what
broke**, **what it taught**. Skimmable in a minute — that is the whole point of
it.

Bugs are **counted here and described elsewhere.** Each one has a full entry in
`.claude/skills/probe/references/known-bugs.md` with its symptom, how it was
detected, the root cause and the test that now pins it. Repeating that here
would be two places to keep true, and the numbers below are the link.

---

## Stage 8 — Recast, warnings with a severity, and no dead controls · 19 Sep

**Shipped.** Three commits. The rename, on its own, with the published site
verified at its basePath rather than assumed. Then the functional half of the
redesign: every warning classified `lost`, `changed` or `note` where it is
written, `lost` never collapsed, notes behind a disclosure, and the routed
step carried as a field so the sentence stays the sentence somebody wrote.
Progress replaced with the worker's actual state — the PDF reader counts pages,
the workbook reader sheets, the EPUB reader chapters. Then `/matrix`, an About
section and "Report a problem"; a language switcher and a conversion guide cut
rather than shipped dead.

**Broke.** Two bugs, known-bugs #16–#17, plus two found by new checks on their
first run.

#16 was recorded in `OPEN.md` rather than discovered: four warnings gave
instructions about a file the reader never had. Three more had the same shape
once anybody looked.

#17 never ran: adding progress without touching the runner's timeout would have
produced a conversion that reported its way steadily to being killed at sixty
seconds.

Then `verify:browser`'s new link walk found `/matrix` 404ing on a conservative
host, because the export wrote `matrix.html` beside a `matrix/` directory with
no index in it. And the same run found a bug in the check itself: dead links
were counted into the conversion total, so it printed "112/114 pairs converted"
when all 114 had converted.

**Then, after all three had shipped:** the live site was still the pre-rename
build. Run #20 had been green and published nothing — a deploy job skipped on a
stale payload field, and a skipped job does not fail a run. Known-bugs #18–#19.
The workflow now looks the publishing branch up rather than reading it off the
event, stamps the export with its commit, and fails the run unless the deployed
site is serving that commit at the right path.

**Taught.** Three things.

A classification has to live where the fact is known. Deciding severity in the
component by matching words like "dropped" was the smaller change and fails in
the worst direction — the first rephrasing demotes a real loss to a note, and
nothing says so.

A timeout measures the wrong thing the moment something else starts reporting
liveness. Sixty seconds without settling meant "wedged" until progress existed;
then it meant "wedged, or merely long".

And a check written this stage found two bugs in its first two runs, one of them
its own. A new check is worth more than the thing it was written for, and is
itself worth distrusting until it has failed on purpose at least once.

The fourth, learned last and the most expensive: **a workflow reports on its own
execution, so it can only be trusted about the world if something in it goes and
looks.** Four guards in this file assert things about `out/`, and every one of
them passed while the published site was three days old. The only check that
could have caught it is the one that fetches the URL.

---

## Stage 7 — The repo's memory · `f323b27` · 17 Sep

**Shipped.** No product code. `docs/DECISIONS.md`, `docs/STAGES.md` and
`docs/OPEN.md`; an `orient` skill whose whole job is routing a question to one
file; three more skills — `measure-memory`, `interface-copy`, `release-check`.
Then `scripts/check-links.mjs`, in CI.

**Broke.** One broken pointer, found by the checker on its first run — the
`add-converter` worked example names a file you would create, which needed a
mechanism rather than an exception. And one that had been broken for four
stages: `CLAUDE.md` referencing a spike write-up that only exists on
`spike/x2t-wasm`.

**Taught.** Documentation can be wrong about itself the same way a caveat can,
and with the same failure mode: the only reader who would notice is the one who
followed the pointer and did not get what they came for. Also that duplication
in documentation is not a tidiness problem — `CLAUDE.md` repeating `OPEN.md`
meant the copy that goes stale would be the copy always in context.

---

## Stage 6 — Routing, then six formats · `c1e7300` · 16 Sep

**Shipped.** The registry stopped being a list of pairs and became a graph:
44 declared edges, at most two composed into a route, 114 pairs. Six formats —
HTML, EPUB, ODT, ODS, JSON, ODP — taking it from eight to fourteen. Memory
multipliers re-keyed onto edges. The reachability matrix snapshotted.

**Broke.** Four bugs, known-bugs #13–#15 plus the caveat one. Three were
invisible in the output: an ODT whose every list had flattened into loose
paragraphs still read as a plausible document. The fourth was a **caveat that
had been false for three stages** — `md → docx` claiming links map to Word
styles when the block model drops them.

**Taught.** Two things.

Read the _intermediate_, not the result. The list bug was found by printing the
HTML the ODF reader hands on, and would not have been found by reading the
Markdown that came out.

And routing turns a false caveat from a wart into a spreading one — a sentence
written for one edge now appears on every pair routed through it. That is why
`interface-copy` exists.

---

## Stage 5 — Closing out functionality · `c27fad2` · 16 Sep

**Shipped.** A warnings channel through `htmlToBlocks`, so the layer between
readers and writers can say what it lost. List depth through all five writers.
CJK in PDF output as two lazy TTF faces. Per-pair memory multipliers. The two
weakest pairs recalibrated, with their ceiling written down.

**Broke.** Four bugs, known-bugs #9–#12. Two of them — the images warning that
never fired and merged cells flattening silently — turned out to be one missing
return value.

**Taught.** Two open bugs with different symptoms can be one bug. Ask what else
is in the same position before calling either fixed.

---

## Stage 4 — Skills with depth, hooks, a full audit · `eef0938` · 15 Sep

**Shipped.** The three skills restructured into a lean `SKILL.md` plus
`references/` carrying the substance. Committed hooks: typecheck after every
edit, tests and bundle budget at the end of a turn. Every pair audited.

**Broke.** A subagent's scratch probe was committed by accident and pushed
unread — eight tests with no assertions that could never fail. Removed in
`ff6b669`; the rule that came out of it is in `CLAUDE.md`.

**Taught.** Two things that are now standing rules. A blanket `git add` is
unsafe while anything else is writing to the repo. And short skills are thin
skills: the depth has to live somewhere, and `references/` is free until read.

---

## Stage 3 — Correctness, not completeness · `ae6e0bd` · 15 Sep

**Shipped.** Fixes for three ways output was _wrong_ rather than missing:
non-Latin text destroyed in PDF, Markdown punctuation leaking into table cells,
and a memory pre-flight guard for mobile Safari. Plus a warning for `xlsx → pdf`
clipping past 12 columns.

**Broke.** Five bugs, known-bugs #6–#8 and two more found while in there. The
PDF one had a single root cause nobody had stated: base-14 fonts are single-byte
WinAnsi and are never embedded, so everything above U+00FF was mojibake.

**Taught.** Find the root cause, not the symptom. A `.replace()` on the output
is almost always the wrong fix — the `**`-in-table-cells bug was one function
ignoring its caller's argument, and it affected three pairs, one of which nobody
had reported.

---

## Stage 2b — The x2t spike · `spike/x2t-wasm` · 15 Sep

**Shipped.** Nothing, deliberately. A throwaway branch and a 222-line write-up
at `docs/x2t-spike.md` **on that branch**.

**Found.** A 47.8 MB WebAssembly module does instantiate and run in a Web
Worker, so the approach is viable at that size class. office2pdf measured
properly and rejected as a `docx → pdf` replacement. x2t itself unmeasurable
without Docker. And the AGPL-3.0 question, which is the only irreversible part.

**Taught.** A spike's job is to produce numbers or to say plainly which numbers
it could not get. It also turned up two Recast bugs in passing, both fixed later.

---

## Stage 2 — The engines · `352639c`, `6b1d917`, `d1d6a14` · 15 Sep

**Shipped.** Every converter, behind dynamic imports, running in a Web Worker.
Byte-based detection. The registry split so the page carries no engine imports —
about 4 MB that had been built, deployed and never fetched.

**Broke.** Five bugs, known-bugs #1–#5, **found under a green suite of 155
tests**. Speaker notes landed on the wrong slide; two bullets merged into one;
every non-ASCII RTF run gained a stray `?`.

**Taught.** The lesson the whole `probe` skill is built on: a conversion that
completes is not a conversion that worked. The suite asked "did this produce a
non-empty blob of the right type" and never asked "is the output correct".

---

## Stage 1 — The shell · `66577b0`–`c6fe40f` · 14 Sep

**Shipped.** A static Next.js export, the design system, the converter registry
pattern, and GitHub Pages deployment.

**Broke.** Nothing in the product. Three commits went on trying to have the
Pages workflow enable Pages itself before accepting that it cannot.

**Taught.** The architecture that everything since has been an instance of: the
interface reads the registry and nothing else, so a format appears in the picker
the moment it is declared and no component ever names one.
