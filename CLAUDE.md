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

## Where things stand

25 pairs, 223 tests, entry chunk ~177 KB gzipped. Static export, deployed to
GitHub Pages. Seven pairs are deliberately unsupported and listed with reasons in
`lib/registry/unsupported.ts`: the value of their output is its visual layout, and
rebuilding that means either a rendering engine too large to ship or a server,
which Kiln will not have.

PDF output embeds pdfmake's Roboto, which covers Latin, Greek and Cyrillic and
nothing else. `lib/registry/converters/_pdf.ts` holds the exact coverage: text it
cannot draw is replaced and named in `warnings`, and a document with nothing
renderable in it is refused. Never let that check be bypassed — silent mojibake
is the bug it was written for.

## Known open issues

- **CJK and right-to-left scripts have no PDF path.** They are reported, not
  rendered. CJK needs a multi-megabyte font; Arabic and Hebrew need bidirectional
  ordering and contextual shaping on top of one. Neither is started.
- **Mobile Safari is still untested on a real device.** The memory thresholds in
  `lib/files/capacity.ts` are provisional guesses, marked as such, waiting on
  numbers from a phone.
- **`xlsx → pdf` clips past 12 columns.** It warns now, but the layout is
  unchanged.
- The x2t question is unresolved. `docs/x2t-spike.md` records how far it got; it
  needs Docker on a real machine to finish.
- The default branch still needs flipping to `main`.
