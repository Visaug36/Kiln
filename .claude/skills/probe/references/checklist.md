# The probe checklist

Every case gives the **input to use**, **what correct output looks like**, and
**which pairs it applies to**. A case you cannot state an expected output for is
not a test yet.

Pair shorthand used below:

- **text in** — `docx`, `odt`, `rtf`, `html`, `epub`, `md`, `txt`, `pdf` as a source
- **text out** — `md`, `txt` as a target (the formats that carry plain runs)
- **rich out** — `docx`, `odt`, `pdf`, `rtf`, `html`, `epub`, `pptx`, `odp` as a target
- **every edge** — the 44 declared converters in `lib/registry/table.ts`
- **every pair** — all 114, direct and routed, in the `routing.test.ts` snapshot

**Probe edges, assert on pairs.** A routed pair is two edges and a hand-off;
there is no third thing to test in the middle. Fix an edge and every pair through
it is fixed — which is also how one bad edge breaks a dozen pairs at once.

Load a fixture with `fixture('sample.docx')` from `test/fixtures.ts`; reach an
engine with `engineFor(from, to)` from `lib/registry/engines.ts`.

---

## 0. The standing rule: check the sibling path

**After fixing anything in a reader, writer or detector, go and look at the other
implementation of the same idea before you stop.** Record both in the test.

This has caught three bugs and been the cause of three more, which is why it is
first:

- Nested lists were fixed in the **HTML** reader during the stage-2 audit. The
  identical bug sat in the **Markdown** reader for two more stages, until an
  audit fed both the same document and compared. (known-bugs #5, #11)
- The images warning never fired, and merged table cells flattened silently.
  Different symptoms, one cause: the layer between readers and writers had
  nowhere to put a warning. Fixing the first did not fix the second because
  nobody asked what else was in that position. (known-bugs #9, #10)
- Markdown punctuation leaked into table cells because `tableRows` ignored the
  formatter its caller chose. The paragraph path beside it was correct the whole
  time. (known-bugs #7)

The siblings in this repo, and the question to ask of each:

| You changed                                                                                                                                  | Also check                                    | Because                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| `_md.ts` (Markdown reader)                                                                                                                   | `_docx.ts` `htmlToBlocks` (HTML reader)       | Both produce `Block[]` and must agree about the same document             |
| `_docx.ts` `htmlToBlocks`                                                                                                                    | `_md.ts` `parseMarkdown`                      | The same, in reverse                                                      |
| Either reader                                                                                                                                | `_pdfread.ts`, `_rtf.ts`, `_odf.ts`           | Four producers of `Block[]` now, and the newest is the easiest to forget  |
| One writer (`_blocks-to-md`, `_blocks-to-pdf`, `writeDocx`, `writeRtf`, `blocksToOdfText`, `_epub` `chapterBody`, `md-to-pptx`, `md-to-odp`) | The other seven                               | A block field one writer honours and seven ignore is a silent loss        |
| `inlineToMarkdown`                                                                                                                           | `htmlToPlainText`                             | The two inline renderers, chosen by the caller                            |
| **`_docx.ts` (DOCX)**                                                                                                                        | **`_odf.ts` `odfTextToHtml` (ODT)**           | Siblings by design: ODT is translated into the HTML shape DOCX produces   |
| **`_sheet.ts` / an `xlsx>*` engine**                                                                                                         | **the ODS keys in `engines.ts`**              | ODS goes through the _same modules_; a reader assumption breaks both      |
| **`_pptx.ts` (PPTX)**                                                                                                                        | **`_odf.ts` `odfPresentationToSlides` (ODP)** | Two deck readers, one `_slides.ts` behind them                            |
| **`_html.ts` `reduceHtml`**                                                                                                                  | **`epub-to-md.ts`**                           | An EPUB chapter is XHTML and goes through the same reduction              |
| Anything that drops content                                                                                                                  | Everything else in that function              | If it can lose one thing silently, ask what else it loses                 |
| A pair's `caveat`                                                                                                                            | Round-trip it and check the claim             | Routing repeats a caveat on every pair through that edge (known-bugs #15) |

**The test records both.** A regression test that pins only the path you fixed
leaves the other free to drift again — which is exactly how #5 survived. Assert
that the two produce the same thing:

```ts
expect(shape(await parseMarkdown(NESTED_MD))).toEqual(
  shape(htmlToBlocks(NESTED_HTML).blocks),
);
```

---

## 1. Text and encoding

### 1.1 Astral-plane characters (emoji)

**Input** `'Party 🎉 and family 👨‍👩‍👧 here'` — the second is a ZWJ sequence, three
code points joined, and it breaks naive per-`charCode` loops.

**Correct** The exact string survives. Round-trip it: `txt → docx → txt`,
`txt → docx → rtf → txt`.

**Applies to** Every pair except `* → pdf`. RTF is the dangerous one: `\u` carries
a **signed 16-bit** value, so an astral character must be written as a surrogate
pair with values above 32767 written negative. See known-bugs #4.

**PDF exception** Roboto has no emoji glyphs. Correct behaviour is replacement
with `U+FFFD` **plus a warning naming "emoji"** — never a rendered box, never
silence.

### 1.2 CJK

**Input** `'日本語のテキスト 中文 한국어'`

**Correct** Survives intact in every text and rich format. In PDF: replaced,
counted, and named as "Chinese, Japanese or Korean" in `warnings`. A document
that is _only_ CJK must be **refused** by `* → pdf`, not converted to a page of
replacement characters.

**Applies to** every pair.

### 1.3 Greek and Cyrillic

**Input** `'Καλημέρα κόσμε'` and `'Здравствуй, мир'`

**Correct** Survives everywhere **including PDF** — these are inside Roboto's
coverage, and `warnings` must be empty. This is the regression that matters: the
base-14 Helvetica turned `Καλημέρα` into `9£±;³·;Ã-<` and reported success.

**Applies to** every pair. See known-bugs #6.

### 1.4 Right-to-left (Arabic, Hebrew)

**Input** `'مرحبا بالعالم'`, `'שלום עולם'`, and a mixed line:
`'revenue مرحبا 12% rose'`

**Correct** Text formats keep the characters and their logical order. PDF must
replace and warn — Kiln has no bidirectional ordering, so anything that _looked_
rendered would be in the wrong visual order, which is worse than a warning.

**Applies to** every pair.

### 1.5 Accented Latin and Latin Extended

**Input** `'Café naïve façade Ærø'` and `'Łódź Ğüneş čeština'`

**Correct** Exact survival everywhere, PDF included. The second string is outside
Latin-1 and is what distinguishes a real encoding fix from one that only handles
the easy range.

**Applies to** every pair.

### 1.6 Ligatures

**Input** `'ﬁnd the ﬁ ligature'` using U+FB01, not `f` + `i`.

**Correct** The word reads `find` on the page. pdfjs decomposes U+FB01 back to
`fi` when extracting, so reading `find` from the text layer is correct, not a
bug.

**Applies to** `* → pdf`, `* → docx`.

### 1.7 A very long unbroken line

**Input** `'x'.repeat(2000)` with no spaces.

**Correct** Wraps to the page or the line width. Never overflows off the page,
never hangs, never truncates silently.

**Applies to** `* → pdf`, `* → docx`, `* → rtf`.

---

## 2. Structure

### 2.1 Nested lists, and a list that continues after a nested one

**Input** `'<ol><li>one<ol><li>one-a</li></ol></li><li>two</li></ol>'`, and the
Markdown equivalent.

**Correct** Three items: `one`, `one-a`, `two` — all three marked ordered. The
failure is subtle and reads plausibly: the item **after** a nested list silently
loses its numbering, because a greedy match for `<ol>…</ol>` ends at the first
closing tag. Also check `<ul><li>outer<ul><li>inner</li></ul></li></ul>` does not
become one bullet reading `outer• inner`.

**Applies to** `docx → *`, `md → *`. See known-bugs #5.

### 2.2 Merged cells

**Input** A Word table whose first row is a single cell with `columnSpan: 2`.

**Correct** _Currently_ flattened to `| Spans two |  |` with a phantom empty
cell and **no warning**. This is a known gap, not settled behaviour — see
known-bugs #10. Do not "fix" it by guessing; the structural loss should be
reported in `warnings`, which needs a warnings channel `htmlToBlocks` does not
have.

**Applies to** `docx → *`, `xlsx → *`.

### 2.3 Inline formatting inside table cells

**Input** A table whose cells hold bold, italic, inline code, a link, and
emphasis nested inside emphasis.

**Correct** Depends on the target, and both directions are load-bearing:

- `docx → md`: cells **keep** `**bold**`, `*italic*`, `` `code` ``,
  `[label](url)` — Markdown is the point there.
- `docx → txt`, `docx → rtf`, `docx → pdf`: cells hold the **words only**. No
  `**`, no backticks, no `](http`.
- `md → docx`, `md → pdf`: same — the markers are consumed, not shown.

Assert with a regex like `/\*\*|`[^`]|\]\(http/` over the whole output.

**Applies to** every pair that can write a table. See known-bugs #7.

### 2.4 Nested emphasis

**Input** `'**outer *inner* outer**'`, plus the near-misses: `'a * b * c'`,
`'5*6 = 30'`, `'snake_case_name'`, `'**unclosed'`.

**Correct** `outer inner outer` — no stray asterisk pair. And the near-misses are
**untouched**: a space-flanked asterisk is not emphasis, `5*6` is arithmetic, and
an underscore inside a word is part of the word.

**Applies to** `md → *`, `docx → text out`.

### 2.5 Headings at every level

**Input** `# Level 1` through `###### Level 6`.

**Correct** All six survive a `md → docx → md` round trip at the same depth.
Levels beyond what a format supports clamp rather than disappear.

**Applies to** `md → *`, `docx → *`.

### 2.6 A document that is only images

**Input** A `.docx` with one `ImageRun` and no text.

**Correct** **Refused** — `'This document has no text in it…'` — not a zero-byte
file reported as done. A document with _both_ text and images converts, with a
warning counting the images. See known-bugs #9.

**Applies to** `docx → *`.

### 2.7 Tables wider than the page

**Input** A table of 15 columns.

**Correct** Columns past 12 are dropped **and a warning says so**, in every pair
that writes a PDF. A 12-column table produces no warning at all.

**Applies to** `md → pdf`, `docx → pdf`, `xlsx → pdf`. See known-bugs #8.

---

## 3. The files themselves

### 3.1 Empty file

**Input** `fixture('empty.txt')`, and a zero-byte file with each extension.

**Correct** Refused with a sentence naming emptiness. Never a crash, never an
empty output file.

**Applies to** every pair.

### 3.2 A `.docx` that is really a legacy `.doc`

**Input** `fixture('actually-a-doc.docx')` — starts `D0 CF 11 E0`.

**Correct** `'This is an old binary .doc file, not a .docx. Open it in Word and
use Save As to make a .docx first.'` The failure mode to avoid is mammoth's own
message, an unhelpful complaint about a zip.

**Applies to** `docx → *`.

### 3.3 Extension disagreeing with the bytes

**Input** `fixture('sample.xlsx', 'renamed.docx')` — a workbook named `.docx`.

**Correct** The **contents win**. The row converts as XLSX and says so:
"This file is named .docx but its contents are XLSX." Detection reads magic bytes
and, for a ZIP, asks the worker which OOXML type it holds.

**Applies to** every pair, through `lib/files/detect.ts`.

### 3.4 Corrupt or truncated archive

**Input** `fixture('corrupt.docx')` — valid ZIP magic, garbage inside.

**Correct** A sentence containing "damaged" or "could not read". No stack frame,
no `[object Object]`, no library jargon, and it ends in a full stop.

**Applies to** `docx → *`, `xlsx → *`, `pptx → *`.

### 3.5 Password-protected document

**Input** A zip containing `EncryptedPackage` and `EncryptionInfo` and no
document parts; for PDF, anything pdfjs raises `PasswordException` on.

**Correct** A sentence a person can act on. `describeFailure` maps both
`PasswordException` and `'File is encrypted'` to a password message.

**Applies to** `docx → *`, `xlsx → *`, `pdf → *`.

### 3.6 A PDF that is a scan with no text layer

**Input** A PDF whose pages carry only images.

**Correct** Refused, naming the cause: the text layer is empty and Kiln does no
OCR. Not an empty `.txt` reported as done.

**Applies to** `pdf → txt`, `pdf → md`.

### 3.7 A file over the memory limit

**Input** A `File` whose `size` is overridden to 200 MB.

**Correct** Refused before any bytes are read, naming the 100 MB limit. Separately,
a file merely _large_ gets a pre-flight caution on the queued row — a warning,
never a block. See `lib/files/capacity.ts`.

**Applies to** every pair.

---

## 4. Spreadsheets

### 4.1 A single-cell sheet

**Input** A one-cell CSV converted to XLSX, then read back.

**Correct** One output file, named without a sheet suffix, and **no** "2 sheets"
warning. The one-sheet and many-sheet naming paths differ and only one of them
gets exercised by the standard fixture.

**Applies to** `xlsx → *`.

### 4.2 Multiple sheets

**Input** `fixture('sample.xlsx')` — two sheets, `Sales` and `Notes`.

**Correct** `xlsx → csv` gives **two files**, `sample-sales.csv` and
`sample-notes.csv`, plus a warning saying there were 2 sheets. `xlsx → md` heads
each sheet with `## Sales` / `## Notes`.

**Applies to** `xlsx → *`.

### 4.3 Formulas

**Input** `sample.xlsx` cell `C4`, which holds `=SUM(C2:C3)` with a cached value
of `4000`.

**Correct** The output contains `4000` and **never** `SUM(` or `=`. Kiln exports
what Excel last computed and does not recalculate.

**Applies to** `xlsx → *`.

### 4.4 A CSV that is not comma-separated

**Input** `fixture('semicolons.csv')`, plus a tab-separated equivalent, plus a
comma-delimited file with commas inside quoted fields.

**Correct** The delimiter is sniffed from the content, the columns come out
right, **and a warning says the file was not comma-separated**. Quoted fields
containing the delimiter must not fool the sniffer.

**Applies to** `csv → *`.

---

## 5. Slides

### 5.1 Speaker notes

**Input** A two-slide deck where **only slide 2** has notes, so PowerPoint stores
them as `notesSlide1.xml` and links them through
`ppt/slides/_rels/slide2.xml.rels`.

**Correct** The notes attach to **slide 2**. Pairing `slideN.xml` with
`notesSlideN.xml` by number puts them on slide 1, and the result reads perfectly
plausibly wherever it lands — which is why this needs an asymmetric fixture, not
a symmetric one. See known-bugs #2.

**Applies to** `pptx → txt`, `pptx → md`.

### 5.2 Slide order

**Input** `fixture('sample.pptx')`.

**Correct** `indexOf('Opening slide') < indexOf('Second slide')`. Zip entry order
is not slide order; `slide10.xml` sorts before `slide2.xml` as a string.

**Applies to** `pptx → *`.

---

## 6. The whole app

- **Privacy.** `pnpm verify:browser` watches every request while conversions run.
  Off-origin requests: none. Requests with a body: none. Fonts and the pdfjs
  worker come from Kiln's own origin.
- **The page stays usable.** Frame latency during a conversion stays in single
  digits; the drop zone stays interactive.
- **The queue survives a bad file.** A job that fails, times out or kills its
  worker must not stop the jobs behind it.
- **Budget.** `pnpm check:bundle` — entry JS under 200 KB gzipped, and no engine
  marker in the entry chunk.

---

## 7. Routing

### 7.1 A routed pair against the two steps by hand

**Input** Any pair whose `find()` returns a `via`. Run the two edges yourself and
compare the bytes.

**Correct** Identical. The hand-off is a real file on purpose; if a routed pair
differs from doing it by hand, something is being smuggled across the join and
the merged caveats are no longer true.

**Applies to** All 70 routed pairs. `run-route.test.ts` pins one.

### 7.2 Warnings say which step lost what

**Input** `odt → html`, whose first step drops an image and whose second does
not exist as a single converter.

**Correct** Every warning prefixed `.odt → .md: `. On a one-step pair there is no
prefix at all — the tag is noise when there is only one place it could have come
from.

### 7.3 A step that produces several files

**Input** `ods → csv` on a two-sheet workbook, then anything further.

**Correct** The next step runs over **each** file, and the output count follows
the document. One sheet becoming one file and two becoming two is the honest
shape; silently taking the first is not.

### 7.4 The matrix snapshot

**Input** `pnpm test`.

**Correct** No snapshot diff, unless you meant to change which pairs exist. One
new edge can add a dozen pairs. Read the diff; do not update it reflexively.

### 7.5 XML element names that share a prefix

**Input** Markup using `text:list` beside `text:list-item`, or `table:table`
beside `table:table-row`.

**Correct** Each matched by its own rule. `\b` is a word boundary and a hyphen
is not a word character, so `/<text:list\b/` matches both — see known-bugs #13,
which flattened every list in a document while the output stayed plausible.

**Applies to** `_odf.ts`, and anything else parsing namespaced XML by hand.
