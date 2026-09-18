---
name: measure-memory
description: Use when measuring or re-measuring what a Recast conversion costs in memory — after upgrading mammoth, SheetJS, pdfmake, pdfjs, docx or pptxgenjs, after adding or changing a converter edge, when EDGE_COST in lib/files/capacity.ts needs new numbers, when the size warning is firing on files it should not or staying silent on files it should not, or when a multiplier looks implausible next to its siblings.
---

# Measuring what a conversion costs

The numbers in `EDGE_COST` decide whether somebody on a phone is warned before
their tab is killed. They are a prediction, never a measurement of their own
file — but the prediction has to be built on real measurements or it is a guess
with a decimal point on it.

**This methodology has been got wrong twice, in two different ways.** Both times
the numbers looked fine. Read `references/method.md` before running anything.

## The run

```bash
NODE_OPTIONS=--expose-gc MEASURE=1 npx vitest run test/measure-memory.test.ts
```

It writes a pasteable table to `edge-cost.txt` (or `$MEASURE_OUT`). Takes about
seven minutes for 44 edges.

## The five rules

1. **Force a collection before every reading.** `--expose-gc` is not optional.
   Without it the baseline is whatever the previous edge left behind, and a
   collection landing mid-conversion silently halves the answer.
2. **Measure against the bytes the engine works on** — the _unpacked_ size for
   the seven ZIP-based formats, because that is what `sizeCaution` multiplies in
   production. Measuring the compressed file inflates the multiplier several
   times over and then applies it to the uncompressed one.
3. **Key on the pair, not the source format.** A source's worst target used to
   speak for all of them, so `md → txt` was judged by `md → pdf`. Recast now keys
   on the **edge** and composes routes from their steps.
4. **Take the worst of two runs** — three is better. The first pays for loading
   the library.
5. **Sanity-check against the previous stage's numbers before believing any of
   it.** This is the step that catches a broken methodology, and it is the one
   people skip.

## The sanity check, concretely

Two pairs that share a reader must land in the same order of magnitude. If
`docx → md` and `docx → txt` differ by a hundredfold, the _measurement_ is
broken, not the engine — that exact reading, ×828 against ×1, is what exposed the
missing forced collection.

Then compare against what the table said last time. When the method is right the
numbers land on top of the old ones: `docx → md` came back ×80 against a
previously recorded ×70, `xlsx → docx` ×183 against ×181. **Agreement across two
independent measurements is the only evidence these numbers mean anything.** A
figure that moved by 10× is a claim about the library that needs its own
explanation before it goes in the table.

## Reference

`references/method.md` has both failures in full, what a route's composed cost
means, how the synthetic inputs are built and why, and what to do when a number
is genuinely surprising.
