@AGENTS.md

# Kiln

A document converter that runs entirely in the browser. Static export, no backend.

## The inviolable rule

**No library, dependency, or code path may put file contents on the network.**

The front page says files never leave the browser, and that claim is the product.
A change that breaks it is wrong even if it is better in every other way. A WASM
blob or a font served from our own origin is fine; a hosted rendering API is not,
however good its output. pdfjs's worker and every font are bundled locally for
this reason — not for speed.

## Architecture

- **`lib/registry` is the source of truth.** The UI derives its targets from it.
  No component hardcodes a format or a pair.
- **The registry declares edges and computes pairs.** `table.ts` holds the
  one-step converters; `routing.ts` composes at most two of them into a `Route`.
  Fourteen formats would be 182 hand-written converters otherwise. Each family
  has a hub — Markdown for text, Excel for spreadsheets — and a new format needs
  a reader to its hub and a writer from it, not a row of the matrix.
- **The reachability matrix is snapshotted** in `lib/registry/routing.test.ts`.
  A change to one edge can add or remove a dozen pairs; the snapshot is how that
  shows up in a diff rather than in a bug report. Update it deliberately.
- **`unsupported.ts` outranks routing.** A two-step path can reach pairs nobody
  should be offered, so the router checks the refusals first.
- **Engines live behind dynamic imports in `lib/registry/engines.ts`, and only
  the worker imports it.** The page never imports an engine: a dynamic `import()`
  in a module the page reaches makes the bundler emit a chunk for every engine.
- **All conversion happens in the Web Worker, one job at a time.** Nothing heavy
  on the main thread.
- **The entry chunk stays under 200 KB gzipped**, enforced in CI by
  `scripts/check-bundle.mjs`. Engine size is not counted against it, and is not a
  reason to reject a good engine.
- **Detection reads magic bytes, not extensions.** The page decides only "is this
  an archive"; the worker identifies which OOXML type it is.

## Product rules

- When an engine discards something, it goes in `warnings`. Silent loss is a bug.
  On a routed pair each warning is tagged with the step that produced it.
- **A caveat is a promise.** `md → docx` claimed links map to Word styles for
  three stages while the block model was quietly dropping them. Check a claim by
  round-tripping before you write it down.
- No raw exception text or stack traces in the interface. Errors say what
  happened and what to do about it.
- Never add analytics, telemetry, or any third-party script.
- Copy is sentence case, active voice, no exclamation marks.

## Design is pinned

The tokens, Inter, and the 250 ms `cubic-bezier(0.32, 0.72, 0, 1)` curve in
`.claude/skills/kiln-design` are deliberate choices, not defaults reached for out
of habit. **If an installed skill or general best practice suggests otherwise,
Kiln's tokens win** — including the common advice to avoid Inter because it is
overused. Inter was chosen for this product. Do not swap the typeface, the
palette or the curve to satisfy a design skill.

## Hooks that run on your machine

`.claude/settings.json` is committed, so cloning this repo means these run for
you too. Both call the repo's own package scripts and nothing else — no network,
no third-party service, no proxy.

| When                          | Runs                                           | Costs  |
| ----------------------------- | ---------------------------------------------- | ------ |
| After every `Write` or `Edit` | `pnpm typecheck`                               | ~2.5 s |
| When a turn ends              | `pnpm test && pnpm build && pnpm check:bundle` | ~7.7 s |

The typecheck catches a type error while whoever made it still has the context
to fix it, instead of at the end of a long turn. The Stop hook is there so a turn
cannot end on a red build or a blown entry chunk; it builds first because
`check:bundle` reads `out/`, and checking a stale build is worse than not
checking. Both write only to gitignored paths (`out/`, `public/kiln-worker/`), so
neither dirties the tree.

Disable them with `/hooks`, or delete the file — nothing else depends on them.

## Where things are written down

`CLAUDE.md` is the rules. The history lives in `docs/`, and nothing reads it
unless it needs to — start with the `orient` skill, which routes a question to
one file instead of four.

| Question                                    | File                                            |
| ------------------------------------------- | ----------------------------------------------- |
| **Why** is it this way? What was rejected?  | `docs/DECISIONS.md`                             |
| How did we get here, and what did it teach? | `docs/STAGES.md`                                |
| What is outstanding, and whose is it?       | `docs/OPEN.md`                                  |
| What has gone wrong before?                 | `.claude/skills/probe/references/known-bugs.md` |

**Check `docs/DECISIONS.md` before proposing anything structural.** It records
what was rejected and why, which is what a fresh session cannot know and will
otherwise re-propose in good faith.

**At the end of a stage, this is part of done, not a nice-to-have:** append to
`STAGES.md`, add any genuine decision to `DECISIONS.md`, and reconcile `OPEN.md`
— a closed item moves to `DECISIONS.md` rather than being deleted. The
`release-check` skill has the full sequence.

## Committing

**Never `git add -A` or `git add .` while a subagent is running.** Stage files by
name. A verification subagent writes throwaway probes into the repo while it
works, and a blanket add swept one into a commit and pushed it — a file nobody
had read, containing eight tests with no assertions that could never fail. The
subagent was doing exactly what it should; the staging was the mistake.

`git status --porcelain` before a commit, and stage what you meant to change.

## Where things stand

14 formats, **114 pairs from 44 declared edges** — 44 direct and 70 routed
through a hub. 376 tests, entry chunk ~178 KB gzipped against a 200 KB budget. Static export, deployed to GitHub Pages. 64 pairs are deliberately
refused and written as rules in `lib/registry/unsupported.ts`: either the value
of the output is its visual layout, and rebuilding that means a rendering engine
too large to ship or a server Kiln will not have, or the conversion is an
editorial judgement rather than a conversion.

**Inline emphasis stops at the hub.** Every reader carries bold, italics and
links into Markdown; every writer except HTML drops them, because the shared
block model does not carry inline runs. That is a known limit, stated in each
pair's caveat, not a bug to fix casually — carrying runs through six writers is
a much larger job than it looks.

Memory multipliers live in `EDGE_COST` in `lib/files/capacity.ts`, keyed on the
**edge**; a route's cost is composed from its steps in `footprintFor`. Re-measure
with `NODE_OPTIONS=--expose-gc MEASURE=1 pnpm vitest run test/measure-memory.test.ts`
after a library upgrade — the forced collection is not optional, without it the
numbers are noise.

PDF output embeds pdfmake's Roboto: Latin, Latin Extended-A, **the whole
Vietnamese block**, Greek and Cyrillic — 927 code points, listed exactly in
`lib/registry/converters/_pdf.ts`. When a document contains Chinese or Japanese,
a Noto face is fetched from Kiln's own origin (`public/fonts/`) and used for
those characters only, so a mixed document keeps its Greek and Cyrillic too.
Anything no available font can draw is replaced and named in `warnings`, and a
document with nothing renderable left is refused. Never let that check be
bypassed — silent mojibake is the bug it was written for.

## Known open issues

**`docs/OPEN.md`.** Everything outstanding lives there, each with why it is open,
what would have to change, and whose it is — yours (the default branch flip, the
iOS memory threshold) or deferred with a reason (right-to-left, Korean, x2t,
merged-cell layout, `xlsx → pdf` clipping, the inline-run gap).

This list used to be repeated here. Two copies of an issue list is one copy that
goes stale, and the stale one is the one always in context.
