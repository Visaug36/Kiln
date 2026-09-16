---
name: probe
description: Use when checking whether a Kiln conversion is actually correct rather than merely producing a file — auditing an engine, chasing a reported fidelity bug ("the output looks wrong", "characters are mangled", "the table is broken", "text went missing"), reviewing a new or changed converter before it ships, or running a verification pass over some or all of the 25 format pairs.
---

# Probing a converter

**A conversion that completes is not a conversion that worked.**

Kiln's stage-2 suite was green while five real bugs sat under it, because the
tests asked "did this produce a non-empty blob of the right type" and never asked
"is the output correct". Speaker notes landed on the wrong slide. Two bullets
merged into one. Every non-ASCII RTF run gained a stray `?`. All of it looked
plausible, and all of it shipped.

So: open the output and read it. Assert on the words, their order and the
structure — never on the byte count, the MIME type or the magic bytes alone.
Those tests already exist and they are the floor, not the check.

## The loop

1. **Write a throwaway probe and watch the bug happen.** A vitest file or a
   script that calls the engine directly and prints what came out. Do not fix
   anything you have not seen fail: half of what gets reported as a bug is
   correct behaviour seen through a bad reader.
2. **Read the output, do not summarise it.** `JSON.stringify` the string so
   stray whitespace and invisible characters show up. For a PDF, pull the text
   layer back with `readPdf` from `_pdfread.ts`. For a DOCX, read it back with
   `readDocx`. For a render you have to look at, rasterise with pdfjs in
   Chromium — CI has no rasteriser, so a checked-in PNG is the record.
3. **Find the root cause, not the symptom.** The nested-list bug was a non-greedy
   regex; stripping the stray bullet afterwards would have passed and left the
   next case broken. If the fix is a `.replace()` on the output, it is almost
   certainly wrong.
4. **Fix the path, not the instance.** Ask which other pairs reach the same code.
   The `**`-in-table-cells bug was one function ignoring its caller's argument,
   and it affected three pairs — the two it was reported on and one nobody
   noticed.
5. **Then check the sibling path, every time.** Kiln has two readers producing
   the same block list and five writers consuming it. Three bugs so far were one
   bug fixed in one implementation and left standing in its twin. The checklist
   opens with the pairs to check and the assertion that pins them together.
6. **Promote every confirmed probe into a permanent regression test.**
   `lib/registry/converters/helpers.test.ts` for a parsing rule,
   `converters.test.ts` for a whole pair, `lib/files/*.test.ts` for detection and
   capacity, `lib/jobs/runner.test.ts` for queue behaviour.
7. **Prove the test would have caught it.** Revert the fix, watch the new test
   fail, restore it. A regression test that passes against the broken code is
   worse than none — twice during the last audit a test passed for the wrong
   reason and had to be rewritten.
8. Finish with `pnpm test` and `pnpm verify:browser`.

## What to probe

`references/checklist.md` is the working document: every case with the exact
input, what correct output looks like, and which pairs it applies to. Work from
it rather than from memory — it covers text and encoding, structure, the files
themselves, spreadsheets and slides.

`references/known-bugs.md` records every bug found so far: how it was detected,
what the root cause turned out to be, and which test now pins it. Read it before
hunting something new. These recur in shape, not in detail — a reader that
mispairs two numbered sequences, a regex that stops at the first closing tag, an
encoding assumption that holds for ASCII.

## Rules that are not negotiable

- **Silent loss is a bug.** If an engine discards something, it goes in
  `warnings`. A conversion that quietly drops a column, an image or a script is
  the worst failure Kiln has, worse than refusing.
- **No raw exception text reaches the interface.** Errors are sentences saying
  what happened and what to do.
- **Never weaken a test to make it pass.** If an assertion is now wrong, the
  behaviour changed and that needs saying out loud.
- **A green suite proves nothing on its own.** It proved nothing twice already.
