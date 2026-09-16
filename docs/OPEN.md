# Open

Everything outstanding, with why it is open and who owns it.

**When something closes it moves to `DECISIONS.md`, it is not deleted.** A
resolved question is a decision, and the reasoning that closed it is exactly what
a future session needs in order not to reopen it.

---

## Yours

Two things nothing in this repo can do.

### Flip the default branch to `main`

The Pages workflow only deploys from the default branch, so until this happens
every stage deploys from its feature branch. Needs repository settings.

### Test the iOS memory threshold on a real phone

`lib/files/capacity.ts` assumes **350 MB** for a WebKit mobile tab and says so in
the code. It is a guess, marked as a guess, and the warning copy tells the user
it is an estimate rather than a measurement. Safari exposes neither
`performance.memory` nor `navigator.deviceMemory`, so this cannot be measured
from inside the browser — only by converting a large file on a device and seeing
whether the tab survives.

It matters because iOS does not throw when a tab runs out of memory; it kills the
tab. There is no error to catch and nothing to report, which is why the check is
a pre-flight rather than a recovery.

---

## Deferred, with reasons

Open because of a decision, not an oversight. Each one names what would have to
change.

### Right-to-left has no PDF path

Arabic and Hebrew are reported, not rendered. fontkit can shape Arabic, but
nothing in the stack implements the Unicode bidirectional algorithm.

**Why it stays open:** a bidi bug looks entirely correct to anyone who does not
read the script. This is the one failure mode Kiln cannot self-verify.

**What would change it:** a UAX #9 implementation _and_ someone who reads the
script to check the output. The second is the binding constraint.

### Korean has no PDF path

Neither shipped Noto face carries a hangul syllable, so a Korean document is
refused — and now says _Korean_, rather than claiming Kiln cannot draw Chinese or
Japanese.

**Why it stays open:** a third multi-megabyte font is a decision about download
size, not an oversight.

**What would change it:** your call on shipping it. The machinery is already
there — `_cjk.ts` loads a face by variant and reads its coverage from the font.

### x2t: build size unmeasured, licence undecided

The write-up is at `docs/x2t-spike.md` on branch `spike/x2t-wasm`.

**Why it stays open:** two blockers. The build needs Docker and roughly 20 GB, so
the `.wasm` size is unknown and a figure from memory would be worse than none.
And CryptPad's vendored ONLYOFFICE core is **AGPL-3.0**, which would reach Kiln's
own source — the only irreversible part of adopting it.

**What would change it:** one afternoon with Docker for the numbers, then your
answer on the licence. If the licence is unacceptable this is a _reject_, and the
refused pairs stay honestly unsupported, which is already how the interface
explains itself.

### Merged table cells flatten, and the layout does not survive

A cell spanning two columns becomes one cell in a plain grid. The text survives
and a warning names it — the silent part was fixed in stage 5 — but the structure
does not.

**Why it stays open:** every writer Kiln has writes a plain grid. Carrying spans
would mean a span model through five writers.

### `xlsx → pdf` clips past 12 columns

It warns, naming the columns lost. The layout is unchanged.

**Why it stays open:** the honest fixes are landscape, a smaller type size, or
splitting across pages, and each is a design decision about what the reader
expects from a wide sheet. Worth taking with the UI stage rather than guessing.

### The block model carries no inline runs

Every reader carries bold, italics and links into Markdown; every writer except
HTML drops them. Each affected pair's caveat says so.

**Why it stays open:** it touches six writers and is a much larger job than it
looks. `_md.ts` says so at the point where it strips them.

**What would change it:** a run model in `Block`, and then six writers taught to
honour it. Not a casual fix, and the caveats are currently honest.

### Four pairs need three hops and so do not exist

`json` to `odt`, `rtf`, `html` and `epub`. Two steps is the rule.

**Why it stays open:** not a defect. Recorded so nobody rediscovers it as one.
ODS has no such gap because it shares its text-side edges with XLSX; JSON's
reader is genuinely its own, so it has a single edge into the text family.

### `pdf → md` and `rtf → md` infer structure, and there is a ceiling

Heading levels are ranked by size; PDF paragraphs split where the line gap
exceeds about twice the type size. Both are real improvements on the fixed ratios
they replaced.

**Why it stays open:** what neither can do is tell a pull quote set large from a
heading, or two short paragraphs at normal leading from one wrapped paragraph.
Both also assume ordinary body text is the commonest size in the document, so a
page that is mostly headings reads its own body size wrong. The caveats say so;
do not claim more.

---

## Noticed, not yet decided

Small, real, and waiting for the right stage rather than for a decision.

### A routed warning can give advice aimed at the wrong person

`pptx → epub` and `xlsx → epub` warn _"There were no top-level headings, so the
whole document became a single chapter. Add `#` headings to split it up."_ The
outcome is accurate; the advice is addressed to someone who wrote the Markdown,
and here Kiln wrote it.

This is the copy-survives-composition problem in miniature, and belongs with the
UI stage's warnings work rather than a patch now. See the `interface-copy` skill.

### `CLAUDE.md` pointed at a file that is not on this branch

`docs/x2t-spike.md` lives on `spike/x2t-wasm`. Now stated wherever it is
referenced, rather than reading as a missing file.
