# Kiln

A document converter that runs entirely in your browser. Drop a file, pick a
target format, download the result. Kiln handles PDF, DOCX, Markdown, plain text
and RTF.

## The constraint

**Every conversion runs client-side. No file is ever uploaded anywhere.**

This is the product, not a feature of it. People convert contracts, medical
letters, drafts they have not shown anyone — documents they should not have to
hand to a stranger's server to change a file extension. So Kiln has no server,
no API, no database, and no analytics. It is a static bundle of HTML, CSS and
JavaScript; once the page has loaded you could pull the network cable and every
conversion would still work.

What that rules out, permanently:

- No route handlers, no middleware, no server actions. The app is built with
  `output: 'export'`, so Next.js would refuse to build one anyway.
- No telemetry or analytics package, and Next.js build telemetry is disabled in
  the `dev` and `build` scripts.
- Fonts are downloaded at build time by `next/font` and served from Kiln's own
  origin. Opening the page contacts no font CDN.
- **No conversion library that needs a network round trip with file contents.**
  If a library uploads the document to render it, it is disqualified no matter
  how good the output is. A WASM blob served from our own origin is fine; a
  hosted rendering API is not.

Keep that last rule in mind when adding engines. It is the one decision that
cannot be walked back.

### On `pnpm audit`

It reports two high advisories in `image-size`, a transitive dependency of
pptxgenjs. They are **not reachable in the browser**: `image-size` is used by
pptxgenjs only on Node, to measure image files on disk, and esbuild drops it
from the worker bundle. Checked by grepping the shipped chunks — none of the
affected parsers (ICNS, JXL, HEIF) appear in any of them.

The `xlsx` line is a different story and was worth acting on: npm's `xlsx`
stops at 0.18.5 with two unpatched high advisories that trigger on _parsing
untrusted input_, which is the whole job here. Kiln uses `@e965/xlsx`, the
maintained SheetJS build published to npm.

## Running it

Requires Node 22 and pnpm.

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

Other scripts:

```bash
pnpm build           # worker bundle + static export into out/
pnpm test            # vitest
pnpm lint            # eslint
pnpm typecheck       # tsc --noEmit
pnpm format          # prettier --write

pnpm fixtures        # regenerate the binary test fixtures
pnpm check:bundle    # fail if the initial JS exceeds its budget
pnpm analyze         # bundle analyzer
pnpm verify:browser  # run every converter through the real UI in Chromium
```

`pnpm verify:browser` is the one that matters most. It serves the built export
the way a static host would — same MIME rules, same paths — then drops each
fixture on the page, picks a target, clicks Convert and reads back what the
browser actually downloaded. It also watches every network request while
conversions run, so the promise on the front page is checked rather than
asserted. Several bugs reached that script and nothing earlier: the worker
shipping as uncompiled TypeScript, `Packer.toBuffer` asking for a Node buffer,
mammoth's CommonJS interop. All of them passed the unit tests.

`pnpm build` writes a static site to `out/`. Deploy that directory anywhere that
serves files — there is no framework runtime to provision.

## Recommended tooling

Kiln commits its own operating instructions — `CLAUDE.md`, three skills under
`.claude/skills/`, and one verifier agent under `.claude/agents/`. Three
third-party skills are worth installing **globally**, and are deliberately not
vendored here:

- **`frontend-design`** (Anthropic)
- **Web Design Guidelines** from `vercel-labs/agent-skills`
- **`systematic-debugging`** and **`verification-before-completion`**, from the
  Superpowers plugin on the official marketplace

They are not committed because a skill is a set of instructions an agent follows,
and any script it bundles runs with that agent's permissions. Vendoring
third-party skills into a repository means everyone who clones it runs them,
having agreed to nothing. Install the ones you trust into your own environment
instead.

One conflict worth knowing about: `frontend-design` discourages Inter as
overused. Inter is a deliberate choice for Kiln, and `CLAUDE.md` overrides that
advice.

## Deploying

### GitHub Pages

`.github/workflows/deploy.yml` builds the export and publishes it on every push
to the default branch. Two things have to be true before the first run, and
neither can be automated from the workflow:

1. **Settings → Pages → Source** must be set to **GitHub Actions**. Letting
   `configure-pages` create the site instead (`enablement: true`) fails with
   _Resource not accessible by integration_ — that endpoint needs admin rights,
   and a workflow's `GITHUB_TOKEN` does not have them.
2. **The repository must be public**, unless the account is on a paid plan.
   GitHub does not serve Pages for private repositories on the free tier.

The site then lands at `https://<user>.github.io/<repo>/`.

A project site is served from a subpath, so the workflow sets
`NEXT_PUBLIC_BASE_PATH` to `/<repo>` and `next.config.ts` feeds that to
`basePath`. Next prefixes everything under `_next/` on its own; the one thing it
does not prefix is the path in `metadata.icons`, which `app/layout.tsx` handles
explicitly. The variable is empty in every other context, so `pnpm dev` and a
root deploy are unaffected.

`public/.nojekyll` stops GitHub from stripping the `_next` directory, whose name
Jekyll would otherwise treat as private.

### Vercel

Import the repository and deploy — the static export is detected with no
configuration, and `NEXT_PUBLIC_BASE_PATH` stays unset, so the site is served
from the root.

## The converter registry

Every conversion is a self-contained plugin. The interface never names a format
or a pair; it reads the registry and renders whatever is there. Adding a format
means adding one file and one entry, and touching no component.

Two modules, deliberately separate.

**`lib/registry/index.ts` — the table.** What Kiln can convert and how well.
This is what the page imports.

```ts
export interface Converter {
  from: Format;
  to: Format;
  /** Shown to the user before they commit, when not 'exact'. */
  fidelity: 'exact' | 'good' | 'lossy';
  /** Human-readable note about what is lost. Required when fidelity is 'lossy'. */
  caveat?: string;
}
```

**`lib/registry/engines.ts` — the engines.** Only the worker imports this.

```ts
export const engines: Record<string, () => Promise<ConvertFn>> = {
  'docx>md': () => import('./converters/docx-to-md').then((m) => m.convert),
  // …
};
```

The split is not tidiness. A dynamic `import()` in a module the _page_ reaches
makes the page's bundler emit a chunk for every engine — about 4 MB that was
built and deployed and then never fetched, because conversions happen in the
worker. Keeping the table free of imports removes all of it.

A conversion returns:

```ts
export interface OutputFile {
  blob: Blob;
  filename: string;
}

export interface ConversionResult {
  files: OutputFile[];
  /** Populated when the engine had to discard something. Shown after conversion. */
  warnings?: string[];
}
```

A result carries a **list** of files because some conversions honestly produce
more than one — a three-sheet workbook going to CSV is three CSVs, not one. When
there is more than one, the row offers a single download that zips them.

The registry exposes:

| Export                | Where from   | Purpose                                            |
| --------------------- | ------------ | -------------------------------------------------- |
| `converters`          | `index.ts`   | The table itself.                                  |
| `targetsFor(from)`    | `index.ts`   | Every format `from` can become. Drives the picker. |
| `find(from, to)`      | `index.ts`   | Fidelity and caveat for one pair, or `undefined`.  |
| `engineFor(from, to)` | `engines.ts` | The loader for one pair. Worker only.              |

Three properties follow, and are worth stating plainly:

- **An engine loads only when a conversion using it starts.** Nothing is fetched
  by opening the page, or by dropping a file, or by picking a target.
- **Engines that share a library share its chunk.** Converting `docx → md` and
  then `docx → pdf` downloads mammoth once, not twice.
- **A pair that is absent is simply not offered.** No disabled options, no
  "coming soon" — if `targetsFor` does not return it, the user never sees it.

### Worked example: adding DOCX → RTF

**1. Write the engine** in `lib/registry/converters/docx-to-rtf.ts`:

```ts
import type { ConversionResult } from '@/lib/registry/types';
import { outputFile, readArrayBuffer } from '@/lib/registry/shared';

export async function convert(input: File): Promise<ConversionResult> {
  // Import the heavy dependency here, inside the engine. This is the only
  // place an engine dependency may be named.
  const { toRtf } = await import('some-docx-library');

  // readArrayBuffer rejects empty and oversized files with a sentence the
  // interface can show, rather than letting the library fail obscurely.
  const rtf = await toRtf(await readArrayBuffer(input));

  return {
    files: [outputFile(input.name, 'rtf', rtf)],
    warnings: ['Images were not carried over.'],
  };
}
```

**2. Declare the pair** in `lib/registry/index.ts`:

```ts
{
  from: 'docx',
  to: 'rtf',
  fidelity: 'lossy',
  caveat: 'Tables and embedded images are dropped. Text and emphasis survive.',
},
```

**3. Wire the engine** in `lib/registry/engines.ts`:

```ts
'docx>rtf': () => import('./converters/docx-to-rtf').then((m) => m.convert),
```

That is the whole change. `.rtf` now appears in the picker for any dropped
`.docx`, the caveat shows before conversion starts, and no component was edited.

Steps 2 and 3 are separate files, so they can drift. They cannot drift silently:
`lib/registry/index.test.ts` fails if a declared pair has no engine, or an engine
has no declared pair.

If the new format is one Kiln has never seen, also add it to the `Format` union
and to `FORMATS` — that array is the canonical display order.

### Conventions engines must follow

- **Throw an `Error` whose message is the interface's voice.** The message is
  rendered verbatim under the failed row, so write
  `This PDF has no extractable text. It may be a scan.` — not `ENOTEXT` and not
  `Oops, something went wrong.` State what happened and what to do about it.
- **Name the output yourself** in `ConversionResult.filename`, normally
  `baseName(input.name)` plus the new extension.
- **Set `fidelity` honestly, and give every `lossy` converter a `caveat`.** A
  test enforces the second half of that.
- **Do nothing at module scope.** Everything heavy belongs behind the `await
import()` inside the engine.

## Support matrix

Twenty-five pairs, all implemented and all verified in a real browser
(`pnpm verify:browser`).

### Text documents

| From | To   | Fidelity | What is lost                                                                   |
| ---- | ---- | -------- | ------------------------------------------------------------------------------ |
| docx | md   | good     | Fonts, colours and page layout. Emphasis, links and lists survive.             |
| docx | txt  | good     | All formatting.                                                                |
| docx | pdf  | lossy    | Styles are approximated; pagination, headers and footers will not match Word.  |
| docx | rtf  | lossy    | Tables, images and precise spacing.                                            |
| md   | docx | good     | Raw HTML blocks.                                                               |
| md   | pdf  | good     | Your previewer's typography.                                                   |
| md   | txt  | exact    | Nothing — only the markers that exist to be rendered.                          |
| txt  | md   | exact    | Nothing; the bytes pass through.                                               |
| txt  | docx | good     | Nothing beyond paragraph structure.                                            |
| txt  | pdf  | good     | Line breaks rewrap to the page.                                                |
| rtf  | txt  | good     | All formatting.                                                                |
| rtf  | md   | lossy    | Heading levels ranked by font size; a large pull quote reads as a heading.     |
| pdf  | txt  | lossy    | Layout, images, tables. A scan has no text at all.                             |
| pdf  | md   | lossy    | Headings ranked by type size, paragraphs split on line spacing. Both inferred. |

### Spreadsheets

| From | To   | Fidelity | What is lost                                                        |
| ---- | ---- | -------- | ------------------------------------------------------------------- |
| xlsx | csv  | exact    | One CSV per sheet; several sheets means several files.              |
| xlsx | md   | good     | Formatting, formulas and merged cells.                              |
| xlsx | txt  | good     | Everything but the values.                                          |
| xlsx | pdf  | lossy    | Sheets wider than 12 columns are cut off; charts and formatting go. |
| xlsx | docx | lossy    | Formulas, charts, images and cell formatting.                       |
| csv  | xlsx | exact    | Nothing.                                                            |
| csv  | md   | good     | Becomes a pipe table, first row as header.                          |
| csv  | txt  | exact    | Nothing; the bytes pass through.                                    |

### Slides

| From | To   | Fidelity | What is lost                                              |
| ---- | ---- | -------- | --------------------------------------------------------- |
| pptx | txt  | lossy    | Everything visual. Slide text only.                       |
| pptx | md   | lossy    | One `##` per slide, bullets beneath; notes become quotes. |
| md   | pptx | good     | Images and tables. Each top-level heading starts a slide. |

**Values, not formulas.** Reading a workbook exports what Excel last computed,
so a cell holding `=SUM(C2:C3)` converts as `4000`. Kiln does not recalculate.

**Warnings, not silence.** When an engine has to drop something — charts, images,
pivot tables, a page with no text layer, a CSV that turned out to be
semicolon-separated, a table too wide for the page, a script the PDF font cannot
draw — it says so under the finished row instead of pretending the conversion was
clean.

### Which scripts survive a PDF

PDF output embeds pdfmake's Roboto: **Latin, Latin Extended-A, the whole
Vietnamese block, Greek and Cyrillic** — 927 code points, listed exactly in
`lib/registry/converters/_pdf.ts` and read out of the font rather than guessed
from the Unicode blocks it looks like it covers.

When a document contains **Chinese or Japanese**, Kiln fetches a Noto face from
its own origin and uses it for those characters only, so a document mixing
Japanese with Greek and Cyrillic keeps all three — a CJK face has no Greek or
Cyrillic, and Roboto has no CJK, so the text is split into runs per font rather
than the document being switched wholesale to one of them.

Everything else — Korean, Arabic, Hebrew, Indic scripts, emoji, and the
dot-below letters Yoruba and Sanskrit transliteration use — Kiln cannot draw. It
does not pretend to: those characters are replaced with `U+FFFD`, named in
`warnings`, and a document with nothing else in it is refused with a note that
Markdown and plain text keep every character.

This replaced the base-14 Helvetica, which is never embedded and is addressed
through a single-byte encoding roughly the size of Latin-1. Anything above
U+00FF had no glyph to reach, so `Καλημέρα` was written as `9£±;³·;Ã-<` and the
conversion reported success. `docs/pdf-scripts/` has the two renders side by
side.

Roboto costs 855 KB raw / 469 KB gzipped, in its own chunk, fetched once per
session and only when a PDF conversion runs — the entry chunk is unchanged. The
CJK faces are 2.25 MB and 2.4 MB and are fetched only by a document that
contains that script; see `public/fonts/README.md` for why they are TTF rather
than the half-the-size woff2, and why there are two of them rather than one
pan-CJK face.

**Right-to-left is not an oversight.** fontkit can shape Arabic, but nothing in
the stack implements the Unicode bidirectional algorithm, so a mixed paragraph
would come out in the wrong visual order — and a bidi bug looks correct to
anyone who does not read the script. It stays a refusal until someone who reads
it can check the result.

### Files too large for the browser

Every conversion happens in memory, so a large enough file can exhaust the tab.
On iOS this is not an error you can catch: the operating system kills the tab and
the page disappears. `lib/files/capacity.ts` estimates the working memory a
conversion needs and compares it against what the browser will admit to having —
`performance.memory` where Chromium exposes it, `navigator.deviceMemory`
otherwise, and a conservative constant on iOS, which exposes neither.

The multiplier is **per pair**, measured by sampling the heap through real
conversions. Keyed on the source format it carried the worst target's figure, so
`md → txt` was judged by `md → pdf`'s ×145 and warned about files it handles in a
few megabytes. The two heaviest are `csv → xlsx` at ×227 and `xlsx → docx` at
×181; both are the shape of the library underneath — SheetJS materialises the
whole workbook XML before it zips anything, and there is no streaming write in
the build Kiln ships — rather than a mistake to fix.

For DOCX, XLSX and PPTX the multiplier is applied to the **unpacked** size, which
the detection step reads out of the zip headers while identifying the file.
Multiplying the compressed size is wrong in both directions: Word XML compresses
by ten to a hundred times, so it cries wolf over a small text-heavy document and
says nothing about a large one full of already-compressed images.

Over the threshold, the row says so **before** the conversion starts, says it is
an estimate rather than a measurement, and says what to try instead. It does not
refuse: the estimate is far too rough to block work on.

The iOS thresholds are provisional guesses awaiting a real device.

## What Kiln will not do

Seven pairs are deliberately absent. They are listed in
`lib/registry/unsupported.ts` and shown in the interface, under a quiet link on
any row whose format has missing targets.

| From | To   | Why not                                                                           |
| ---- | ---- | --------------------------------------------------------------------------------- |
| pptx | pdf  | Rendering slides faithfully needs a full presentation engine.                     |
| pptx | docx | No honest mapping from positioned slide elements to flowing prose.                |
| pdf  | docx | A PDF records glyph positions, not paragraphs. Rebuilding structure is guesswork. |
| pdf  | xlsx | Table detection in a PDF is inference. Wrong numbers are worse than none.         |
| pdf  | pptx | Two unreliable steps stacked on each other.                                       |
| xlsx | pptx | Deciding what deserves a slide is editorial, not mechanical.                      |
| docx | pptx | Splitting prose into slides is a writing task.                                    |

They all reduce to the same constraint: the output's value is its visual layout,
and reconstructing that means shipping a rendering engine to the browser or
sending the document to a server. The second is the one thing Kiln will not do,
and the first is too large to be honest about.

This is not hedging. The constraint that makes Kiln private is the same
constraint that limits it, and a product that hides the second half while
advertising the first is not telling the truth. So the limits are in the
interface, with reasons, and there is no waitlist.

## How the app is put together

```
app/
  layout.tsx          Fonts, metadata, the theme colour
  page.tsx            The one screen
  globals.css         Design tokens and motion
components/
  DropZone.tsx        Page-wide drop target plus the visible frame
  JobRow.tsx          One document, one line
  JobList.tsx         The list and its footer
  FormatPicker.tsx    Target formats, read from the registry
lib/
  registry/           The converter table and its contract
  jobs/               Zustand store, job types, the sequential runner
  files/              Extension detection and blob downloads
```

**Job state** lives in `lib/jobs/store.ts` and is deliberately not persisted.
Jobs hold real `File` handles, which cannot be serialised meaningfully; a refresh
clears the page and the files with it. That is the intended behaviour.

**Conversions run in a Web Worker**, one at a time, serialised through a promise
chain in `lib/jobs/runner.ts`. The page stays interactive while a large file is
being chewed on — measured at ~4ms frame latency mid-conversion. A conversion
that has not finished in 60 seconds is treated as wedged: the worker is
terminated, that job fails with an explanation, and a fresh worker is built so
later jobs still run.

**The worker is built separately**, by `scripts/build-worker.mjs`, into
`public/kiln-worker/`. This is not a stylistic choice. Next's bundler does not
compile `new Worker(new URL('./x.ts', import.meta.url))` for the client build —
it copies the TypeScript source into the output as a static asset, so the
deployed page fetches raw TypeScript, is handed a non-JavaScript MIME type by
the host, and fails every conversion. Dev, tests and `pnpm build` all stayed
green while that was true. esbuild bundles it explicitly instead, with
`splitting: true` so the engines remain separate chunks fetched on demand.

**Detection reads bytes, not names.** `docx`, `xlsx` and `pptx` are all ZIP
archives, so an extension check cannot tell them apart and mislabelled files are
common. `lib/files/detect.ts` reads the leading bytes. Identifying _which_ OOXML
format an archive holds needs a zip library, so that step happens in the worker
(`lib/files/archive.ts`) — otherwise the page would ship a second copy of JSZip,
downloaded by everyone who drops an Office file. When the name and the contents
disagree, the contents win and the row says so.

**Design tokens** are CSS variables in `app/globals.css`, exposed to Tailwind
through `@theme inline` so they follow the live theme. There are no hardcoded
colours in component files. Dark mode follows `prefers-color-scheme` and can be
forced with a `.dark` or `.light` class on `<html>`.

Ember — the one warm accent — is spent on at most one thing per screen: the
single firing job. Everything else is warm neutral. Keep it that way in review.
