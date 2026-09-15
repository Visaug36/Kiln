# Bugs found so far

Every bug Kiln has had, how it was **detected**, what the **root cause** turned
out to be, and the **test** that now pins it.

Read the shapes, not the details. Nothing here was found by a crash: every one
produced output that looked entirely plausible, and most of them shipped green.

---

## The stage-2 audit: five bugs under a green suite

The suite had 155 passing tests. Every one asked "did this produce a non-empty
blob of the right type". None asked "is the output correct". Five bugs were
sitting underneath.

### 1. The job queue died on the first throw

**Symptom** One bad file ended the session. Every job queued behind it was
skipped in silence — no error, no failed row, nothing.

**Detected** By reading `runner.ts` while looking for something else. No test
covered it, and no user report would have described it correctly.

**Root cause** `queue = queue.then(...)`. A throw in any turn leaves the chain
permanently rejected, and every `.then()` after it is skipped rather than run.

**Fix** A `.catch()` on the chain that reports the failure per job. It should
never fire, which is exactly why it must not be left to chance.

**Pinned by** `runner.test.ts` → "keeps draining the queue instead of dying
silently", which stubs the store to throw on one job and asserts the next one
still reaches `done`.

**Shape to remember** Promise chains used as queues fail closed and silently.

---

### 2. Speaker notes attached to the wrong slide

**Symptom** A deck where only slide 5 had notes put them on slide 1.

**Detected** By building an **asymmetric** fixture on purpose. The existing
fixture had notes on every slide, so pairing by number and pairing by
relationship gave identical output.

**Root cause** PowerPoint numbers notes independently of slides: slide 5's notes
are stored as `notesSlide1.xml` if it is the only slide with notes. The reader
paired `slideN.xml` with `notesSlideN.xml`.

**Fix** Resolve through `ppt/slides/_rels/slideN.xml.rels`, which names the notes
part the slide actually points at.

**Pinned by** `converters.test.ts` → "attaches notes to the slide that owns them,
not the one with the same number".

**Shape to remember** Two independently-numbered sequences in one container. The
wrong pairing reads perfectly plausibly wherever it lands. A symmetric fixture
cannot catch it.

---

### 3. RTF dropped a character into every non-ASCII run

**Symptom** `€100` read back as `€?100`. One stray `?` per escaped character.

**Detected** By putting a euro sign in a fixture and reading the result, rather
than checking it was non-empty.

**Root cause** `\uN` is followed by fallback characters for readers that cannot
do Unicode, and those must be **consumed**. How many is set by `\ucN`, which the
reader ignored entirely.

**Fix** Honour `\ucN`, defaulting to 1, and skip that many characters after each
`\u` — including an escaped `\'3f`, which is one character, not four.

**Pinned by** `helpers.test.ts` → "consumes the fallback character after \\u",
plus cases for `\uc0` and `\uc2`.

**Shape to remember** A format's escape syntax with a **count** controlled by a
separate directive elsewhere in the document.

---

### 4. RTF could not write emoji

**Symptom** 😀 was emitted as `\u128512?`, which no reader accepts.

**Detected** By round-tripping the writer's own output back through the reader —
the writer alone looked fine.

**Root cause** RTF's `\u` carries a **signed 16-bit** value. An astral character
does not fit in one escape, and values above 32767 must be written negative.

**Fix** Split astral characters into their surrogate pair and write each half,
negative where it exceeds 32767, as Word does.

**Pinned by** `helpers.test.ts` → "splits astral characters into the surrogate
pair RTF expects" and "round-trips an astral character back through the reader".

**Shape to remember** Round-trip your own writer through your own reader. A
writer test that only inspects the output cannot see this.

---

### 5. Nested lists collapsed, and numbering stopped after them

**Symptom** Two bullets arrived as one reading `outer• inner`. Separately, items
**after** a nested list silently lost their numbering.

**Detected** By feeding in the HTML Word actually emits,
`<li>outer<ul><li>inner</li></ul></li>`, rather than the tidy HTML a test author
would write.

**Root cause** Two regexes. The non-greedy `<li>…</li>` match stopped at the
inner `</li>`, swallowing the nested list into the parent item. And ordered-list
marking matched `<ol>…</ol>`, which ends at the **first** closing tag — so
everything after a nested list fell outside the match.

**Fix** Split items at a nested list before parsing, and walk the tags with a
stack rather than matching a pair.

**Pinned by** `helpers.test.ts` → five cases under "HTML lists", including
sibling lists in both orders and a stray closing tag.

**Shape to remember** Regexes over nestable markup. `.*?` finds the first close,
not the matching one. If the input can nest, a regex cannot parse it.

---

## The correctness pass: three reported, two more found

### 6. Non-Latin text was destroyed in PDF output

**Symptom** `Καλημέρα` rendered as `9£±;³·;Ã-<`. Greek, Cyrillic, CJK, Arabic,
Hebrew and emoji all destroyed. The conversion reported success and the user
downloaded a PDF of nonsense.

**Detected** Reported by a human comparing Kiln's output against another
converter's. Confirmed by rendering a page of scripts and reading the text layer
back.

**Root cause** pdfmake was driven by the **base-14 Helvetica**, which is never
embedded — every PDF reader is assumed to have it — and is addressed through a
single-byte encoding roughly the size of Latin-1. Code points above U+00FF had no
glyph to reach, so their UTF-16 units were written as Latin-1 bytes.

**Fix** pdfmake's bundled Roboto, embedded: Latin, Greek, Cyrillic, 927 code
points. The coverage table in `_pdf.ts` was read **out of the font**, not guessed
from the Unicode blocks it looks like it covers. What it cannot draw is replaced
with `U+FFFD`, named in `warnings`, and refused outright if nothing in the
document is renderable.

**Pinned by** `converters.test.ts` → "scripts in PDF output", five cases. The
before and after renders are in `docs/pdf-scripts/`.

**Shape to remember** A font that is _referenced_ rather than _embedded_ carries
an encoding assumption with it. Also: the guard walks the whole content tree, not
each engine's text, so no converter can forget to call it — and it scans only
`content`, because counting the Latin letters in pdfmake's own style names once
stopped a page of Japanese from ever looking unrenderable.

---

### 7. Markdown punctuation leaked into table cells

**Symptom** `**Metric**` in the cells of every PDF, RTF and plain-text conversion
of a Word table — while the paragraphs beside them came out clean.

**Detected** Reported. Confirmed in one read of `_docx.ts`.

**Root cause** `tableRows()` called `inlineToMarkdown` **whatever formatter the
caller had chosen**. Cells were the one path that skipped the caller's argument.

**Fix** `tableRows(html, render)` — take the same formatter the surrounding
blocks use.

**Probing it turned up a second bug**: emphasis nested inside emphasis was
mangled everywhere, not only in cells. `**outer *inner* outer**` became
`*outer inner outer*`, because `\*\*([^*]+)\*\*` cannot match content containing
an asterisk. The stripper now repeats to a fixed point and refuses space-padded
matches, so nesting unwraps while `a * b * c` and `5*6 = 30` keep their asterisks.

**Pinned by** `helpers.test.ts` → "inline markers" and "table cells take the
caller's formatter", which asserts **both** directions: plain for the writers
that set whole blocks, Markdown for the engines that asked for it.

**Shape to remember** A function that ignores its own parameter. Grep for the
option name and check every branch actually reads it.

---

### 8. Wide tables lost columns in silence

**Symptom** A table past 12 columns was clipped with no word, in `md → pdf` and
`docx → pdf`. `xlsx → pdf` had always said.

**Detected** By reading the three PDF engines side by side after fixing something
else — one of them warned and two did not.

**Root cause** `blocksToPdfContent` returned only content, so it had nowhere to
put a warning. `xlsx-to-pdf` called `pdfTable` directly and checked for itself.

**Fix** `blocksToPdfContent` returns `{ content, warnings }`, and all three share
one `clippedWarning()` so the sentences cannot drift.

**Pinned by** `helpers.test.ts` → "tables too wide for the page";
`converters.test.ts` → "wide tables", covering all three pairs.

**Shape to remember** When one caller of a shared helper does the right thing and
another does not, the helper is the wrong shape.

---

### 9. Images vanished, and the warning for it never fired

**Symptom** A Word document of only pictures converted to an **empty file**
reported as done. A document with pictures and text lost the pictures with no
warning.

**Detected** By running the "document that is only images" case from the
checklist, which nothing had ever exercised.

**Root cause** `summariseDocxWarnings` looked for a mammoth **message** mentioning
an image. mammoth inlines a picture as a data URI and says nothing, so the branch
was dead code from the day it was written. Every writer downstream then stripped
the `<img>` tag.

**Fix** Count `<img` in the HTML mammoth produced. And refuse a conversion whose
text is empty, rather than handing back a blank file.

**Pinned by** `converters.test.ts` → "pictures in a Word document".

**Shape to remember** A warning keyed off someone else's diagnostic message is a
warning that may never fire. Assert the warning appears, not just that the
conversion succeeds — and check that "no output" is refused rather than shipped.

---

### 10. Merged cells flatten with no warning — **still open**

**Symptom** A Word cell with `columnSpan: 2` becomes `| Spans two |  |`: a
phantom empty cell, no warning.

**Root cause** `tableRows` reads each `<td>` as one cell and ignores `colspan`
and `rowspan` entirely.

**Why it is still open** The data survives; only the structure is
misrepresented. Reporting it properly needs a warnings channel `htmlToBlocks`
does not have, which touches six engines. That is a design change, and it was
raised rather than decided.

---

## Two tests that passed for the wrong reason

Worth recording separately, because a test that passes against broken code is
worse than no test.

1. A test asserting that a killed worker settles a pending detection advanced the
   clock past **both** the kill and the detection's own 15-second timeout. It
   passed with the fix reverted. Rewritten to start the detection one second
   before the kill.
2. An earlier version of the same test used the `error` path, where the detection
   settles through its own listener regardless. Also passed with the fix
   reverted.

**Always revert the fix and watch the new test fail.** Both of these looked
correct and neither was.
