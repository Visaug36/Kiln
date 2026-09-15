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

The contract lives in `lib/registry/types.ts`:

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

export interface Converter {
  from: Format;
  to: Format;
  /** Shown to the user before they commit, when not 'exact'. */
  fidelity: 'exact' | 'good' | 'lossy';
  /** Human-readable note about what is lost. Required when fidelity is 'lossy'. */
  caveat?: string;
  /** Dynamic import of the engine, so heavy libs are never in the initial bundle. */
  load: () => Promise<(input: File) => Promise<ConversionResult>>;
}
```

A result carries a **list** of files because some conversions honestly produce
more than one — a three-sheet workbook going to CSV is three CSVs, not one. When
there is more than one, the row offers a single download that zips them.

`lib/registry/index.ts` exposes three things:

| Export             | Purpose                                                   |
| ------------------ | --------------------------------------------------------- |
| `converters`       | The table itself.                                         |
| `targetsFor(from)` | Every format `from` can become. Drives the format picker. |
| `find(from, to)`   | The converter for one pair, or `undefined`.               |

Two properties follow from this and are worth stating plainly:

- **`load` is called once the user commits, never at import time.** That is the
  only reason a PDF engine can be added without every visitor downloading it.
- **A pair that is absent is simply not offered.** There are no disabled options
  and no "coming soon" — if `targetsFor` does not return it, the user never sees
  it.

### Worked example: adding DOCX → RTF

**1. Write the engine** in `lib/registry/converters/docx-to-rtf.ts`. It exports a
function taking a `File` and returning a `Blob` plus the name to save it under.

```ts
import type { ConversionResult } from '@/lib/registry/types';
import { outputFile, readArrayBuffer } from '@/lib/registry/shared';

export async function convert(input: File): Promise<ConversionResult> {
  // Import the heavy dependency here, inside the engine, not at module top
  // level of the registry — that is what keeps it out of the initial bundle.
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

**2. Add one entry** to `converters` in `lib/registry/index.ts`:

```ts
{
  from: 'docx',
  to: 'rtf',
  fidelity: 'lossy',
  caveat: 'Tables and embedded images are dropped. Text and emphasis survive.',
  load: () => import('./converters/docx-to-rtf').then((m) => m.convert),
},
```

That is the whole change. `.rtf` now appears in the picker for any dropped
`.docx`, the caveat shows before conversion starts, and no component was edited.

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

| From | To   | Fidelity | What is lost                                                                  |
| ---- | ---- | -------- | ----------------------------------------------------------------------------- |
| docx | md   | good     | Fonts, colours and page layout. Emphasis, links and lists survive.            |
| docx | txt  | good     | All formatting.                                                               |
| docx | pdf  | lossy    | Styles are approximated; pagination, headers and footers will not match Word. |
| docx | rtf  | lossy    | Tables, images and precise spacing.                                           |
| md   | docx | good     | Raw HTML blocks.                                                              |
| md   | pdf  | good     | Your previewer's typography.                                                  |
| md   | txt  | exact    | Nothing — only the markers that exist to be rendered.                         |
| txt  | md   | exact    | Nothing; the bytes pass through.                                              |
| txt  | docx | good     | Nothing beyond paragraph structure.                                           |
| txt  | pdf  | good     | Line breaks rewrap to the page.                                               |
| rtf  | txt  | good     | All formatting.                                                               |
| rtf  | md   | lossy    | Structure is guessed from font size and weight.                               |
| pdf  | txt  | lossy    | Layout, images, tables. A scan has no text at all.                            |
| pdf  | md   | lossy    | Headings inferred from type size — genuinely unreliable.                      |

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
semicolon-separated — it says so under the finished row instead of pretending
the conversion was clean.

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
common. `lib/files/detect.ts` reads the leading bytes, and for OOXML opens the
archive and reads `[Content_Types].xml`. When the name and the contents
disagree, the contents win and the row says so.

**Design tokens** are CSS variables in `app/globals.css`, exposed to Tailwind
through `@theme inline` so they follow the live theme. There are no hardcoded
colours in component files. Dark mode follows `prefers-color-scheme` and can be
forced with a `.dark` or `.light` class on `<html>`.

Ember — the one warm accent — is spent on at most one thing per screen: the
single firing job. Everything else is warm neutral. Keep it that way in review.
