---
name: interface-copy
description: Use when writing or changing any words a person reads in Recast — a button, a label, an empty state, a warning under a finished conversion, an error message, a pair's caveat in the registry table, a reason in the unsupported list, or the front-page copy. Also use when reviewing copy someone else wrote, when a warning reads oddly in context, or when deciding what a failure should say.
---

# Writing Recast's words

Recast's copy carries the product's one promise and every one of its limits. A
sentence that overstates what survived a conversion is not a style problem; it is
the product lying.

## The house style

- **Sentence case.** Not Title Case, not ALL CAPS.
- **Active voice**, and say who did what. "Recast went with the contents", not "the
  contents were used".
- **No exclamation marks.** None.
- **No raw exception text, no stack traces, no library names.** An error says
  what happened and what to do about it. `describeFailure` in
  `lib/registry/shared.ts` is where library messages are turned into sentences.
- **Name things as the reader has them**, not as the code does: "a chart",
  "merged cells", "a scanned PDF" — not "a drawingML part".

## The two rules this project learned the hard way

### 1. Copy must survive composition

A sentence written for one place now appears in places its author never saw. 70
of Recast's 114 pairs are two converters composed, and **each step's caveat and
every warning it emits is shown on every pair routed through it.**

The live example: `pptx → epub` and `xlsx → epub` warn _"There were no top-level
headings, so the whole document became a single chapter. Add `#` headings to
split it up."_ The outcome is accurate. The advice is addressed to somebody who
wrote that Markdown — and here Recast wrote it, from a deck.

So: **write a sentence that is true wherever the file came from.** State the
outcome always; give advice only when the reader is certainly the person who can
act on it. Before shipping a warning, ask which routed pairs will show it, and
read it as a person arriving from each of them.

### 2. A caveat is a promise, and must be checked against real output

`md → docx` told people _"Headings, lists, **links**, quotes and code blocks map
to Word styles"_ for three stages. Links never survived — `parseMarkdown` strips
inline runs before any writer sees them. Nobody noticed, because the pair
produces a perfectly good Word file.

**A false caveat is worse than a missing one.** A missing one leaves a person to
check; a false one tells them not to bother. And routing spreads it: that
sentence now appears on every pair routed through `md → docx`.

**Never write a caveat from what the pair ought to do.** Convert a real fixture,
read the output back, and confirm the claim. The round trip is four lines — see
`references/style.md`.

## Before you ship a sentence

1. Sentence case, active, no exclamation mark, nothing raw from a library.
2. If it names something that survives — round-trip it and look.
3. If it belongs to an edge — read it from each routed pair that will show it.
4. If it gives advice — check the reader can actually take it.

`references/style.md` has the full checklist, the voice with examples of the
same sentence written badly and well, the warning and error patterns Recast
already uses, and how to verify a claim.
