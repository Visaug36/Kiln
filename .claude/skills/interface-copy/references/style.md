# Kiln's voice, in full

## Who is reading

Somebody who dropped a file and wants it back in another format. They are not a
developer, they did not choose the library, and they do not care which one
failed. They care about two things: **did my document survive**, and **what do I
do now**.

Kiln also asks them to believe a promise — that the file never left the browser.
Copy that overclaims anywhere makes that promise harder to believe everywhere.

---

## The rules, with examples

### Sentence case

> ✗ Download All Files
> ✓ Download 3 files

### Active voice, and name the actor

> ✗ The contents were used to determine the format.
> ✓ This file is named `.docx` but its contents are XLSX. Kiln went with the
> contents.

### No exclamation marks

None. Not in success, not in errors, not in the empty state.

### Say what happened and what to do

An error is not a status code with a friendly font.

> ✗ Error: end of central directory not found
> ✓ This DOCX file is damaged and cannot be opened. Try re-saving it from the
> app that made it.

> ✗ PasswordException
> ✓ This file is password-protected. Remove the password and try again.

When there is genuinely nothing to do, say that instead of inventing advice:

> ✓ This PDF has no text in it. It's probably a scan, and Kiln can't read those.

### Never leak the library

`describeFailure` in `lib/registry/shared.ts` matches library messages by
signature — none of them expose error codes — and returns a sentence. Its final
fallback is deliberately vague rather than raw:

> ✓ Kiln could not read this file. It may be damaged, or saved in a format this
> converter does not handle.

The real error goes to `console.error`, where a developer can find it. It never
leaves the browser and it never reaches the interface.

### Count things properly

Singular and plural are both written out. Kiln does this everywhere:

```ts
`${n === 1 ? 'An image was' : `${n} images were`} not carried over.`;
```

"1 chapter were read" shipped once. It is the kind of thing nobody reports and
everybody notices.

### Name things as the reader has them

> ✗ 3 drawingML parts were not carried over.
> ✓ 3 charts were not carried over — only cell values convert.

---

## Warnings

A warning appears **under a finished conversion** and says what the engine had to
discard. Silent loss is a bug; this is the channel that prevents it.

The pattern: **what was lost, how much of it, and what you have instead.**

> ✓ 3 charts were not carried over — only cell values convert.
> ✓ A pivot table was not carried over; you get the cells it was built from, not
> the pivot.
> ✓ 2 table cells spanned more than one row or column. Kiln writes a plain grid,
> so they are now single cells and the columns may not line up with the original.
> ✓ 4 of 12 pages had no text to extract and came through empty — those pages are
> probably scans.

On a routed pair the worker prefixes each warning with the step that produced it
(`.odt → .md: An image was not carried over`), because which half lost something
reads very differently. **Write the sentence so it still reads well with that
prefix in front of it.**

---

## Caveats

A caveat appears **before the conversion runs**, on any pair that is not `exact`,
and it is a promise about the pair rather than a report about one file.

The pattern: **what survives, then what does not.**

> ✓ Headings, lists, links and emphasis carry over. Fonts, colours and page
> layout do not.
> ✓ Each sheet is drawn as a plain table. Sheets wider than the page are clipped,
> and charts and formatting are dropped.

### Verifying one

Four lines, and the only thing that makes a caveat trustworthy:

```ts
const write = await engineFor('md', to)!();
const out = (await write(fixture('sample.md'))).files[0]!;
const read = await engineFor(to, 'md')!();
const back = await read(new File([await out.blob.arrayBuffer()], out.filename));
// Then read it. Does the thing you are about to claim actually appear?
console.log(await back.files[0]!.blob.text());
```

Run it for every claim the sentence makes. `sample.md` carries bold, italics, a
link, nested lists, a quote, a fenced block and a table, so one round trip tests
most of what a caveat is likely to say.

### Routing multiplies a caveat

`find(from, to)` merges every step's caveat, deduplicated, and prepends a note
naming the intermediate. A sentence on `md → docx` is shown on every pair routed
through it — there are eight. Check `find()` for who will see it:

```ts
allRoutes().filter((r) => r.steps.some((s) => s.from === 'md' && s.to === 'docx'));
```

---

## The unsupported list

A refusal is the place Kiln is most tempted to sound apologetic, and it should
not. The constraint that makes Kiln private is the same one that limits it.

**Give the real reason, not a hedge.** No "not yet", no "coming soon", no
waitlist.

> ✓ Splitting prose into slides means deciding what deserves a slide, which is a
> writing task. Convert to Markdown first and put a heading where each slide
> should start — Kiln will honour those.

That one does three things worth copying: it refuses, it explains _why_ in terms
of the work rather than the code, and it offers the route that does exist.

Because one reason now covers several targets, write it to read well for all of
them — `unsupportedGroupsFor` groups by reason and prints the targets together.

---

## The checklist

Before a sentence ships:

1. **Style.** Sentence case, active, no exclamation mark, nothing raw from a
   library, counted properly.
2. **True.** If it names something that survives, round-trip a fixture and look
   at the output. Do not write it from what the pair ought to do.
3. **Composable.** If it belongs to an edge, list the routed pairs that will show
   it and read it as a person arriving from each.
4. **Actionable.** If it gives advice, confirm the reader is the person who can
   act on it. If they are not, state the outcome and stop.
5. **In the reader's words**, not the format's.

## Where the copy lives

| What                          | Where                                                   |
| ----------------------------- | ------------------------------------------------------- |
| Caveats, one per edge         | `lib/registry/table.ts`                                 |
| Refusals, one reason per rule | `lib/registry/unsupported.ts`                           |
| The routed hand-off note      | `viaNote` in `lib/registry/routing.ts`                  |
| Error sentences               | `describeFailure` in `lib/registry/shared.ts`           |
| Warnings                      | each engine, and the shared helpers under `converters/` |
| Memory caution                | `sizeCaution` in `lib/files/capacity.ts`                |
| Interface chrome              | `app/page.tsx`, `components/`                           |

Colour, type and spacing are the `kiln-design` skill's, not this one's.
