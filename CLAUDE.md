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

- **`lib/registry/index.ts` is the source of truth.** The UI derives its targets
  from it. No component hardcodes a format or a pair.
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

## Committing

**Never `git add -A` or `git add .` while a subagent is running.** Stage files by
name. A verification subagent writes throwaway probes into the repo while it
works, and a blanket add swept one into a commit and pushed it — a file nobody
had read, containing eight tests with no assertions that could never fail. The
subagent was doing exactly what it should; the staging was the mistake.

`git status --porcelain` before a commit, and stage what you meant to change.

## Where things stand

25 pairs, 258 tests, entry chunk ~177 KB gzipped. Static export, deployed to
GitHub Pages. Seven pairs are deliberately unsupported and listed with reasons in
`lib/registry/unsupported.ts`: the value of their output is its visual layout, and
rebuilding that means either a rendering engine too large to ship or a server,
which Kiln will not have.

PDF output embeds pdfmake's Roboto: Latin, Latin Extended-A, **the whole
Vietnamese block**, Greek and Cyrillic — 927 code points, listed exactly in
`lib/registry/converters/_pdf.ts`. When a document contains Chinese or Japanese,
a Noto face is fetched from Kiln's own origin (`public/fonts/`) and used for
those characters only, so a mixed document keeps its Greek and Cyrillic too.
Anything no available font can draw is replaced and named in `warnings`, and a
document with nothing renderable left is refused. Never let that check be
bypassed — silent mojibake is the bug it was written for.

## Known open issues

- **Right-to-left has no PDF path.** Arabic and Hebrew are reported, not
  rendered. fontkit can shape Arabic, but nothing in the stack implements the
  Unicode bidirectional algorithm, so a mixed paragraph would come out in the
  wrong visual order — and a bidi bug looks correct to anyone who does not read
  the script. Deliberately not started until someone who reads it can check it.
- **Korean has no PDF path.** Neither shipped face carries a hangul syllable, so
  a Korean document is refused. A third font is a decision, not an oversight.
- **A CJK document with no kana gets the Chinese face.** `日本語` is three kanji
  and nothing in it says Japanese. Both faces carry the shared Han characters so
  it renders, but with Chinese glyph shapes.
- **Latin Extended Additional is only half there.** Vietnamese is complete; the
  dot-below and macron-below letters Yoruba and Sanskrit transliteration use are
  not. They are replaced and named, not silently dropped.
- **Mobile Safari is still untested on a real device.** The memory thresholds in
  `lib/files/capacity.ts` are provisional guesses, marked as such, waiting on
  numbers from a phone.
- **`xlsx → pdf` clips past 12 columns.** It warns now, but the layout is
  unchanged.
- **`pdf → md` and `rtf → md` infer structure the format does not record, and
  there is a ceiling.** Heading levels are ranked by size and PDF paragraphs
  split where the line gap exceeds about twice the type size, which is a real
  improvement over the fixed ratios they used before. What neither can do: tell
  a pull quote set large from a heading, or tell two short paragraphs set at
  normal leading from one wrapped paragraph. Both also assume ordinary body text
  is the commonest size in the document — a page that is mostly headings reads
  its own body size wrong. The caveats say so; do not claim more.
- The x2t question is unresolved. `docs/x2t-spike.md` records how far it got; it
  needs Docker on a real machine to finish.
- The default branch still needs flipping to `main`.
