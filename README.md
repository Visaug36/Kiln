# Recast

A document converter that runs entirely in your browser. Drop a file, pick a
target format, download the result. Recast handles fourteen formats — PDF, Word,
OpenDocument, RTF, HTML, EPUB, Markdown, plain text, PowerPoint, Excel, CSV and
JSON — in 114 combinations.

## The constraint

**Every conversion runs client-side. No file is ever uploaded anywhere.**

This is the product, not a feature of it. People convert contracts, medical
letters, drafts they have not shown anyone — documents they should not have to
hand to a stranger's server to change a file extension. So Recast has no server,
no API, no database, and no analytics. It is a static bundle of HTML, CSS and
JavaScript; once the page has loaded you could pull the network cable and every
conversion would still work.

What that rules out, permanently:

- No route handlers, no middleware, no server actions. The app is built with
  `output: 'export'`, so Next.js would refuse to build one anyway.
- No telemetry or analytics package, and Next.js build telemetry is disabled in
  the `dev` and `build` scripts.
- Fonts are downloaded at build time by `next/font` and served from Recast's own
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
untrusted input_, which is the whole job here. Recast uses `@e965/xlsx`, the
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

It serves the export at the root by default. A GitHub Pages project site is
served from `/<repo>` instead, and that prefix is baked into every asset URL at
build time, so the published site is reproduced by giving both commands the same
prefix:

```bash
# The prefix is the repository name, the same value CI derives from
# GITHUB_REPOSITORY. Deriving it here too means it survives a rename.
BASE="/$(basename -s .git "$(git remote get-url origin)")"

NEXT_PUBLIC_BASE_PATH="$BASE" pnpm build
NEXT_PUBLIC_BASE_PATH="$BASE" pnpm verify:browser
```

Any request the export makes that the prefix does not cover is reported as a
missing asset and fails the run. Renaming the repository is the way this breaks:
the site moves, the build keeps the old prefix, and the page still renders its
heading from static HTML while every script is gone.

`pnpm build` writes a static site to `out/`. Deploy that directory anywhere that
serves files — there is no framework runtime to provision.

## Recommended tooling

Recast commits its own operating instructions: `CLAUDE.md`, the history in `docs/`,
seven skills under `.claude/skills/`, and one verifier agent under
`.claude/agents/`. Everything below is worth installing **globally**, and is
deliberately not vendored here.

### Plugins and MCP servers

- **Playwright** — drives a real browser. Checking 114 pairs by hand is the
  largest recurring manual cost in this project, and `pnpm verify:browser` is
  built on it.
- **Chrome DevTools** — the network tab is how the privacy promise gets checked
  by eye rather than only by script, and the memory profiler is the only honest
  way to look at a conversion's peak in the environment it actually runs in.
- **TypeScript LSP** — real go-to-definition and type information across a
  codebase where the registry, the engines and the worker are deliberately
  separate modules.
- **Context7** — current documentation for SheetJS, pdfmake, mammoth, docx and
  pdfjs. Several of Recast's bugs came from an API that had moved since whatever
  the model last saw.

### Skills

- **`frontend-design`** (Anthropic) — for the interface work.
- **Web Design Guidelines** from `vercel-labs/agent-skills`.
- **`systematic-debugging`** and **`verification-before-completion`**, from the
  Superpowers plugin on the official marketplace. Both earn their place here
  specifically: most of Recast's bugs produced output that looked entirely
  plausible and shipped under a green suite.

### Why none of them are committed

A skill is a set of instructions an agent follows, and any script it bundles runs
with that agent's permissions. Vendoring third-party skills into a repository
means everyone who clones it runs them, having agreed to nothing. Install the
ones you trust into your own environment instead.

The same reasoning is why Recast's own committed hooks in `.claude/settings.json`
call only the repo's own package scripts — no network, no third-party service, no
proxy.

One conflict worth knowing about: `frontend-design` discourages Inter as
overused. Inter is a deliberate choice for Recast, and `CLAUDE.md` overrides that
advice.

### The skills in this repo

| Skill            | For                                                            |
| ---------------- | -------------------------------------------------------------- |
| `orient`         | Starting or resuming a session — routes a question to one file |
| `add-converter`  | Adding a format or a conversion edge                           |
| `probe`          | Checking a conversion is correct, not merely producing a file  |
| `interface-copy` | Anything a person reads: buttons, warnings, errors, caveats    |
| `recast-design`  | Colour, type, spacing, motion                                  |
| `measure-memory` | Re-measuring `EDGE_COST` after a library upgrade               |
| `release-check`  | Finishing a stage                                              |

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

Four modules behind one façade, `lib/registry/index.ts`, which is all the page
imports.

**`table.ts` — the edges.** One-step conversions, written by hand. It is a list
of edges, not of pairs: most pairs Recast offers are two of these composed.

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

**`routing.ts` — the pairs.** Turns a requested pair into a **route** of one or
two edges, with the fidelity and caveats that follow from it.

```ts
export interface Route {
  from: Format;
  to: Format;
  /** One or two converters, in the order they run. */
  steps: Converter[];
  /** The worst link in the path. */
  fidelity: Fidelity;
  /** Every step's caveat, in order, deduplicated. */
  caveats: string[];
  /** The format the file passes through, when there is one. */
  via?: Format;
}
```

A one-step route and a two-step route are the same shape on purpose: nothing
downstream — not the picker, not the row, not the worker — has to ask which kind
it got.

**`unsupported.ts` — the refusals.** Rules that expand into pairs, checked by the
router before it goes looking for a path.

**`engines.ts` — the engines.** Only the worker imports this.

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

| Export                  | Where from       | Purpose                                                             |
| ----------------------- | ---------------- | ------------------------------------------------------------------- |
| `converters`            | `table.ts`       | The declared edges.                                                 |
| `targetsFor(from)`      | `routing.ts`     | Every format `from` can reach, direct or routed. Drives the picker. |
| `find(from, to)`        | `routing.ts`     | The `Route` for one pair, or `undefined`.                           |
| `edge(from, to)`        | `routing.ts`     | The one-step converter for a pair, if there is one.                 |
| `allRoutes()`           | `routing.ts`     | Every pair Recast offers. Used by the matrix snapshot.              |
| `isUnsupported(a, b)`   | `unsupported.ts` | Whether a pair is refused, whatever route could reach it.           |
| `engineFor(from, to)`   | `engines.ts`     | The loader for one **edge**. Worker only.                           |
| `runRoute(route, file)` | `run-route.ts`   | Runs a route's steps in order. Worker only.                         |

Three properties follow, and are worth stating plainly:

- **An engine loads only when a conversion using it starts.** Nothing is fetched
  by opening the page, or by dropping a file, or by picking a target.
- **Engines that share a library share its chunk.** Converting `docx → md` and
  then `docx → pdf` downloads mammoth once, not twice.
- **A pair that is absent is simply not offered.** No disabled options, no
  "coming soon" — if `targetsFor` does not return it, the user never sees it.
- **A routed pair loads two engines, one after the other**, and the hand-off
  between them is a real file. The second engine sees exactly what a person
  would have got had they run the two conversions themselves, which is what
  makes the merged caveats true rather than optimistic.

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

If the new format is one Recast has never seen, also add it to the `Format` union
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

**Fourteen formats, 114 pairs**, all verified in a real browser
(`pnpm verify:browser`).

Those pairs are not 114 converters. Recast declares **44 edges** — one-step
conversions written by hand — and computes the rest as two of them run back to
back. Fourteen formats would otherwise be 182 hand-written converters, each with
its own bugs and its own caveat to keep true.

Each family has a **hub** that everything else connects through: Markdown for
text documents, Excel for spreadsheets. A new format needs a reader to its hub
and a writer from it, and it is reachable from the whole family.

### How a pair is reached

`✓` is a direct converter. A format name is the one the file passes through on
the way. `—` is a pair Recast does not offer, and the interface says why.

| from \ to  | `pdf` | `docx` | `odt` | `rtf` | `html` | `epub` | `md` | `txt` | `pptx` | `odp` | `xlsx` | `ods` | `csv` | `json` |
| ---------- | ----- | ------ | ----- | ----- | ------ | ------ | ---- | ----- | ------ | ----- | ------ | ----- | ----- | ------ |
| **`pdf`**  | ·     | md     | md    | md    | md     | md     | ✓    | ✓     | —      | —     | —      | —     | —     | —      |
| **`docx`** | ✓     | ·      | md    | ✓     | md     | md     | ✓    | ✓     | —      | —     | —      | —     | —     | —      |
| **`odt`**  | md    | md     | ·     | md    | md     | md     | ✓    | md    | —      | —     | —      | —     | —     | —      |
| **`rtf`**  | md    | md     | md    | ·     | md     | md     | ✓    | ✓     | —      | —     | —      | —     | —     | —      |
| **`html`** | md    | md     | md    | md    | ·      | md     | ✓    | md    | —      | —     | —      | —     | —     | —      |
| **`epub`** | md    | md     | md    | md    | md     | ·      | ✓    | md    | —      | —     | —      | —     | —     | —      |
| **`md`**   | ✓     | ✓      | ✓     | ✓     | ✓      | ✓      | ·    | ✓     | ✓      | ✓     | —      | —     | —     | —      |
| **`txt`**  | ✓     | ✓      | md    | md    | md     | md     | ✓    | ·     | md     | md    | —      | —     | —     | —      |
| **`pptx`** | —     | md     | md    | md    | md     | md     | ✓    | ✓     | ·      | —     | —      | —     | —     | —      |
| **`odp`**  | —     | md     | md    | md    | md     | md     | ✓    | ✓     | —      | ·     | —      | —     | —     | —      |
| **`xlsx`** | ✓     | ✓      | md    | md    | md     | md     | ✓    | ✓     | —      | —     | ·      | ✓     | ✓     | ✓      |
| **`ods`**  | ✓     | ✓      | md    | md    | md     | md     | ✓    | ✓     | —      | —     | ✓      | ·     | ✓     | xlsx   |
| **`csv`**  | md    | md     | md    | md    | md     | md     | ✓    | ✓     | —      | —     | ✓      | xlsx  | ·     | xlsx   |
| **`json`** | xlsx  | xlsx   | —     | —     | —      | —      | xlsx | xlsx  | —      | —     | ✓      | xlsx  | xlsx  | ·      |

The matrix is snapshotted in `lib/registry/routing.test.ts`, so a change to one
edge that quietly adds or removes a dozen pairs shows up in a diff rather than in
a bug report.

### The rules that keep routing honest

- **Two steps at most.** Three compounds the loss past the point of usefulness,
  and each step is a whole file written and parsed again. A pair that would need
  three hops does not exist — which is why `json → epub` is blank above while
  `ods → epub` is not.
- **A direct converter always wins**, even where a path also works. It was
  written for that pair; a path was not.
- **Fidelity is the worst link.** An `exact` step followed by a `lossy` one is
  `lossy`.
- **Caveats merge**, deduplicated, and a routed pair adds one more line naming
  the format it passes through. Both reasons are shown before you commit, not
  the first one.
- **Warnings accumulate across the path**, each tagged with the step that
  produced it: `.odt → .md: An image was not carried over`. Which half lost
  something matters.
- **A family boundary is crossed at most once.** Text documents, spreadsheets
  and slides are separate families. A spreadsheet read out as prose is an honest
  reduction; re-inflating that prose back into a grid is not, so `pdf → xlsx`
  does not exist however it is asked for.

### The 44 edges

#### Text documents — hub: `md`

| From | To   | Fidelity | What is lost                                                                   |
| ---- | ---- | -------- | ------------------------------------------------------------------------------ |
| docx | md   | good     | Fonts, colours and page layout. Emphasis, links and lists survive.             |
| docx | txt  | good     | All formatting.                                                                |
| docx | pdf  | lossy    | Styles are approximated; pagination, headers and footers will not match Word.  |
| docx | rtf  | lossy    | Tables, images and precise spacing.                                            |
| odt  | md   | good     | Fonts, colours, page layout, footnotes. Emphasis, links and tables survive.    |
| html | md   | lossy    | Styling, scripts, images and anything whose value is its layout.               |
| epub | md   | lossy    | Cover, table of contents, metadata and styling. Chapters join into one file.   |
| rtf  | txt  | good     | All formatting.                                                                |
| rtf  | md   | lossy    | Heading levels ranked by font size; a large pull quote reads as a heading.     |
| pdf  | txt  | lossy    | Layout, images, tables. A scan has no text at all.                             |
| pdf  | md   | lossy    | Headings ranked by type size, paragraphs split on line spacing. Both inferred. |
| md   | docx | good     | Inline emphasis, links, raw HTML.                                              |
| md   | odt  | good     | Inline emphasis and links.                                                     |
| md   | pdf  | good     | Inline emphasis, links, your previewer's typography.                           |
| md   | rtf  | lossy    | Tables become tab-separated lines. Inline emphasis and links.                  |
| md   | html | good     | Nothing structural — **the one target that keeps emphasis and links**.         |
| md   | epub | good     | Images, inline emphasis, links. Each `#` starts a chapter.                     |
| md   | txt  | exact    | Nothing — only the markers that exist to be rendered.                          |
| txt  | md   | exact    | Nothing; the bytes pass through.                                               |
| txt  | docx | good     | Nothing beyond paragraph structure.                                            |
| txt  | pdf  | good     | Line breaks rewrap to the page.                                                |

**Inline emphasis stops at the hub.** Every reader carries bold, italics and
links into Markdown, and every writer except HTML drops them: the block model
the writers share does not carry inline runs, and four formats' worth of run
handling is a much larger job than it looks. HTML is the exception because it is
rendered directly from the Markdown rather than through that model. The caveats
say so on each pair rather than promising otherwise.

#### Spreadsheets — hub: `xlsx`

| From | To   | Fidelity | What is lost                                                        |
| ---- | ---- | -------- | ------------------------------------------------------------------- |
| xlsx | csv  | exact    | One CSV per sheet; several sheets means several files.              |
| xlsx | ods  | good     | Formulas, charts, images and cell formatting.                       |
| xlsx | json | good     | Formulas and formatting. Every value arrives as a string.           |
| xlsx | md   | good     | Formatting, formulas and merged cells.                              |
| xlsx | txt  | good     | Everything but the values.                                          |
| xlsx | pdf  | lossy    | Sheets wider than 12 columns are cut off; charts and formatting go. |
| xlsx | docx | lossy    | Formulas, charts, images and cell formatting.                       |
| ods  | xlsx | good     | Formulas, charts, images and cell formatting.                       |
| ods  | csv  | exact    | One CSV per sheet.                                                  |
| ods  | md   | good     | Formatting, formulas and merged cells.                              |
| ods  | txt  | good     | Everything but the values.                                          |
| ods  | pdf  | lossy    | Sheets wider than 12 columns are cut off.                           |
| ods  | docx | lossy    | Formulas, charts, images and cell formatting.                       |
| csv  | xlsx | exact    | Nothing.                                                            |
| csv  | md   | good     | Becomes a pipe table, first row as header.                          |
| csv  | txt  | exact    | Nothing; the bytes pass through.                                    |
| json | xlsx | good     | Nesting is flattened to dotted keys.                                |

ODS shares five of those engines with XLSX rather than copying them: SheetJS
reads both, and the engines work on rows. Declaring the edges records a
capability that already existed — leaving them out would have offered
`xlsx → odt` while refusing `ods → odt`.

**JSON is a spreadsheet, not a document.** The only JSON Recast reads or writes is
tabular: an array of records becomes rows with the keys as a header, and a
workbook of several sheets becomes an object of arrays keyed by sheet name — the
shape it reads back, so a round trip survives. A nested object flattens to dotted
keys (`lead.name`), an array inside a value becomes comma-separated text, and
both are said out loud in the caveat. Arbitrary nested JSON is not a table and
Recast does not pretend it is one.

#### Slides

| From | To   | Fidelity | What is lost                                                     |
| ---- | ---- | -------- | ---------------------------------------------------------------- |
| pptx | txt  | lossy    | Everything visual. Slide text only.                              |
| pptx | md   | lossy    | One `##` per slide, bullets beneath; notes become quotes.        |
| odp  | txt  | lossy    | Everything visual. Slide text only.                              |
| odp  | md   | lossy    | One `##` per slide, bullets beneath; notes become quotes.        |
| md   | pptx | good     | Images, tables, emphasis. Each top-level heading starts a slide. |
| md   | odp  | good     | Images, tables, emphasis. Each top-level heading starts a slide. |

Slides have no hub, and no deck becomes another deck. Recast reads a deck as text
only — there is no browser-sized library that can rebuild a layout — so
`pptx → odp` would hand you the words and lose every design decision in the
original.

**Only Markdown becomes slides.** A `#` heading is an explicit statement of where
one slide ends and the next begins; prose carries no such marker, and inventing
them is writing rather than converting. That is why `docx → pptx` is refused
while `md → pptx` is not, and why `txt → pptx` is offered — `txt → md` is a
byte-for-byte copy, so a `.txt` file is Markdown as far as this is concerned.

**Values, not formulas.** Reading a workbook exports what Excel last computed,
so a cell holding `=SUM(C2:C3)` converts as `4000`. Recast does not recalculate.

**Warnings, not silence.** When an engine has to drop something — charts, images,
pivot tables, a footnote, a script tag, a page with no text layer, a CSV that
turned out to be semicolon-separated, a table too wide for the page, a script the
PDF font cannot draw — it says so under the finished row instead of pretending
the conversion was clean.

### Which scripts survive a PDF

PDF output embeds pdfmake's Roboto: **Latin, Latin Extended-A, the whole
Vietnamese block, Greek and Cyrillic** — 927 code points, listed exactly in
`lib/registry/converters/_pdf.ts` and read out of the font rather than guessed
from the Unicode blocks it looks like it covers.

When a document contains **Chinese or Japanese**, Recast fetches a Noto face from
its own origin and uses it for those characters only, so a document mixing
Japanese with Greek and Cyrillic keeps all three — a CJK face has no Greek or
Cyrillic, and Roboto has no CJK, so the text is split into runs per font rather
than the document being switched wholesale to one of them.

Everything else — Korean, Arabic, Hebrew, Indic scripts, emoji, and the
dot-below letters Yoruba and Sanskrit transliteration use — Recast cannot draw. It
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
the build Recast ships — rather than a mistake to fix.

For DOCX, XLSX and PPTX the multiplier is applied to the **unpacked** size, which
the detection step reads out of the zip headers while identifying the file.
Multiplying the compressed size is wrong in both directions: Word XML compresses
by ten to a hundred times, so it cries wolf over a small text-heavy document and
says nothing about a large one full of already-compressed images.

Over the threshold, the row says so **before** the conversion starts, says it is
an estimate rather than a measurement, and says what to try instead. It does not
refuse: the estimate is far too rough to block work on.

The iOS thresholds are provisional guesses awaiting a real device.

## What Recast will not do

**Sixty-four pairs are deliberately absent**, and four more are simply out of
reach in two steps. They are written as rules in `lib/registry/unsupported.ts` —
one reason covering every pair it applies to, because fourteen formats make 182
ordered pairs and a reason repeated eight times is a reason nobody maintains.
They are shown in the interface, under a quiet link on any row whose format has
missing targets, grouped the same way.

The list is also what stops routing being too clever: a two-step path can reach
pairs nobody should be offered, so the router checks here first.

| From              | To              | Why not                                                                                                                                                                        |
| ----------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| any text document | any spreadsheet | Recast will not guess which parts of a document are a table. A spreadsheet that is subtly wrong is worse than none.                                                            |
| prose documents   | `pptx`, `odp`   | Splitting prose into slides means deciding what deserves a slide, which is a writing task. Markdown and plain text are the exception: a `#` heading says where a slide starts. |
| `pptx`, `odp`     | `pdf`           | A deck converted to PDF should look like the deck. Recast reads slides as text, and rendering the real layout needs a full presentation engine.                                |
| `pptx`, `odp`     | any spreadsheet | A deck is not a grid. The text on a slide has no rows or columns to recover.                                                                                                   |
| any spreadsheet   | `pptx`, `odp`   | Turning a sheet into slides is an editorial judgement, not a conversion.                                                                                                       |
| `pptx`, `odp`     | each other      | Recast reads a deck as text only, so there is no layout to carry across.                                                                                                       |

Two of these used to be absolute and are not any more. `pdf → docx` and
`pptx → docx` are now offered as two-step conversions, because refusing them
while offering `pdf → md` and `pptx → md` was inconsistent: the loss is in the
first step either way, and it is disclosed either way. What is still refused is
`pptx → pdf`, and the difference is the reader's expectation — somebody asking
for that wants printable slides, and a prose PDF would be a worse answer than no.

The four out-of-reach pairs are `json` to `odt`, `rtf`, `html` and `epub`.
Nothing is wrong with them; they simply need three hops, and three compounds the
loss past the point of usefulness. Convert to `.xlsx` or `.md` first. ODS reaches
all four because it shares its text-side edges with XLSX — JSON, whose reader is
genuinely its own, has only the one edge into the family.

The refusals all reduce to one of two things: the output's value is its visual
layout, and reconstructing that means shipping a rendering engine to the browser
or sending the document to a server — the second being the one thing Recast will
not do. Or the conversion is an editorial judgement, and a converter that guesses
at one produces something you have to redo.

This is not hedging. The constraint that makes Recast private is the same
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
`public/recast-worker/`. This is not a stylistic choice. Next's bundler does not
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
single converting job. Everything else is warm neutral. Keep it that way in
review.
