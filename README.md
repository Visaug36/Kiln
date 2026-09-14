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
pnpm build        # static export into out/
pnpm test         # vitest
pnpm lint         # eslint
pnpm typecheck    # tsc --noEmit
pnpm format       # prettier --write
```

`pnpm build` writes a static site to `out/`. Deploy that directory anywhere that
serves files — the Vercel project needs no framework runtime.

## The converter registry

Every conversion is a self-contained plugin. The interface never names a format
or a pair; it reads the registry and renders whatever is there. Adding a format
means adding one file and one entry, and touching no component.

The contract lives in `lib/registry/types.ts`:

```ts
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
import { baseName } from '@/lib/files/detect';

export async function convert(input: File): Promise<ConversionResult> {
  // Import the heavy dependency here, inside the engine, not at module top
  // level of the registry — that is what keeps it out of the initial bundle.
  const { toRtf } = await import('some-docx-library');

  const rtf = await toRtf(await input.arrayBuffer());

  return {
    blob: new Blob([rtf], { type: 'application/rtf' }),
    filename: `${baseName(input.name)}.rtf`,
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

Thirteen pairs, all stubs in this phase: `load` resolves to a function that
throws `Not implemented`. The UI path around them is complete.

| From | To   | Fidelity | What is lost                                |
| ---- | ---- | -------- | ------------------------------------------- |
| docx | md   | good     | Fonts, colours and page layout.             |
| docx | txt  | good     | All formatting.                             |
| docx | pdf  | lossy    | Exact pagination, headers and footers.      |
| md   | docx | good     | Raw HTML blocks.                            |
| md   | pdf  | good     | Your previewer's typography.                |
| md   | txt  | exact    | Nothing.                                    |
| txt  | md   | exact    | Nothing.                                    |
| txt  | pdf  | good     | Line breaks rewrap to the page.             |
| txt  | docx | good     | Nothing beyond paragraph structure.         |
| rtf  | txt  | good     | All formatting.                             |
| rtf  | md   | lossy    | Tables and images; structure is inferred.   |
| pdf  | txt  | lossy    | Layout, images, tables. Scans have no text. |
| pdf  | md   | lossy    | Structure is inferred from type size.       |

A blank cell in this matrix is deliberate: `pdf → docx` is absent because no
client-side engine produces a result worth offering, and Kiln would rather not
offer it than offer it badly.

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

**Conversions run one at a time**, serialised through a promise chain in
`lib/jobs/runner.ts`. Engines do real work on the main thread, so running several
at once would make the page stutter.

**Design tokens** are CSS variables in `app/globals.css`, exposed to Tailwind
through `@theme inline` so they follow the live theme. There are no hardcoded
colours in component files. Dark mode follows `prefers-color-scheme` and can be
forced with a `.dark` or `.light` class on `<html>`.

Ember — the one warm accent — is spent on at most one thing per screen: the
single firing job. Everything else is warm neutral. Keep it that way in review.
