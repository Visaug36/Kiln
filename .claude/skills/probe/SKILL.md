---
name: probe
description: Use when auditing, debugging, or stress-testing Kiln's conversion output — checking whether an engine is actually correct rather than merely producing a file, hunting a suspected fidelity bug, or reviewing a new or changed converter before it ships.
---

# Probing a converter

**A conversion that completes is not a conversion that worked.**

Kiln's stage-2 suite was green while five real bugs sat under it, because the
tests asked "did this produce a non-empty blob of the right type" and never asked
"is the output correct". Notes landed on the wrong slide. Two bullets merged into
one. Every non-ASCII RTF run gained a stray `?`. All of it looked plausible.

So: open the output and read it. Assert on the words, the order and the
structure, never on the byte count.

## The checklist

**Text and encoding.** Emoji and other astral-plane characters, in and out. CJK.
Greek and Cyrillic. Right-to-left text in Arabic or Hebrew. Accented Latin.
Ligatures such as `fi`. A very long unbroken line.

**Structure.** Nested ordered and unordered lists — and a list that _continues_
after a nested one, which is where numbering silently stops. Tables with merged
cells. Inline formatting inside table cells. Headings at every level. A document
that is only images.

**Files themselves.** An empty file. A `.docx` that is really a legacy `.doc`. A
file whose extension disagrees with its bytes. A corrupt or truncated archive. A
password-protected document. A PDF that is a scan with no text layer.

**Spreadsheets.** A single-cell sheet. Multiple sheets. Formulas, which must
export as computed values, never as formula strings. A CSV delimited by
semicolons or tabs.

**Slides.** Speaker notes, which must reach the correct slide via the
relationships file — PowerPoint numbers notes independently of slides, so pairing
`slide5.xml` with `notesSlide5.xml` is wrong and looks right.

## How to work

1. **Write a throwaway probe first and confirm the bug exists.** A script in the
   scratchpad that calls the engine directly and prints what came out. Do not fix
   anything you have not watched fail.
2. **Fix the root cause, not the symptom.** The nested-list bug was a non-greedy
   regex; stripping the stray bullet afterwards would have "passed" and left the
   next case broken.
3. **Promote every confirmed probe into a permanent regression test**, in
   `lib/registry/converters/helpers.test.ts` for a parsing rule, or
   `converters.test.ts` for a whole pair.
4. Finish with `pnpm test` and `pnpm verify:browser`.

The last audit turned five confirmed bugs into 26 regression tests. That ratio is
the expected shape of the work — a bug is one wrong line and several cases that
prove it stays fixed. Two of Kiln's known bugs (mojibake in PDF output, `**`
leaking into table cells) were found this way and are still open.
