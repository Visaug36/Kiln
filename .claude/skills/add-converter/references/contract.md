# The registry contract

Everything an engine has to satisfy, and one pair built end to end.

## The two modules

**`lib/registry/index.ts` — the table.** What Kiln can convert and how well. The
page imports this, so it contains **no `import()` calls at all**.

```ts
export type Format = 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'csv' | 'md' | 'txt' | 'rtf';

export type Fidelity = 'exact' | 'good' | 'lossy';

export interface Converter {
  from: Format;
  to: Format;
  /** Shown to the user before they commit, when not 'exact'. */
  fidelity: Fidelity;
  /** Human-readable note about what is lost. Required when fidelity is 'lossy'. */
  caveat?: string;
}
```

`Converter` deliberately has **no reference to its engine**. A dynamic `import()`
reachable from the page makes the page's bundler emit a chunk for every engine —
roughly 4 MB that gets built and deployed and then never fetched, because
conversions happen in the worker.

**`lib/registry/engines.ts` — the engines.** Only the worker imports this.

```ts
export const engines: Record<string, () => Promise<ConvertFn>> = {
  'docx>md': () => import('./converters/docx-to-md').then((m) => m.convert),
  // … 25 entries
};

export function engineFor(
  from: Format,
  to: Format,
): (() => Promise<ConvertFn>) | undefined {
  return engines[`${from}>${to}`];
}
```

## What a conversion returns

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

export type ConvertFn = (input: File) => Promise<ConversionResult>;
```

A result carries a **list** because some conversions honestly produce more than
one — a three-sheet workbook going to CSV is three CSVs. When there is more than
one, the row offers a single download that zips them.

## What the registry exposes

| Export                | Where from   | Purpose                                            |
| --------------------- | ------------ | -------------------------------------------------- |
| `converters`          | `index.ts`   | The table itself.                                  |
| `FORMATS`             | `index.ts`   | Canonical display order.                           |
| `targetsFor(from)`    | `index.ts`   | Every format `from` can become. Drives the picker. |
| `find(from, to)`      | `index.ts`   | Fidelity and caveat for one pair, or `undefined`.  |
| `unsupported`         | `index.ts`   | Pairs Kiln deliberately refuses, with reasons.     |
| `engineFor(from, to)` | `engines.ts` | The loader for one pair. **Worker only.**          |

Three properties follow:

- **An engine loads only when a conversion using it starts.** Nothing is fetched
  by opening the page, dropping a file, or picking a target.
- **Engines sharing a library share its chunk.** `docx → md` then `docx → pdf`
  downloads mammoth once.
- **A pair that is absent is simply not offered.** No disabled options, no
  "coming soon". If `targetsFor` does not return it, nobody sees it.

## Helpers every engine should use

From `lib/registry/shared.ts`:

| Helper                         | Does                                                              |
| ------------------------------ | ----------------------------------------------------------------- |
| `readArrayBuffer(input)`       | Reads bytes; refuses empty and over-100 MB files with a sentence. |
| `readText(input)`              | The same, decoded as UTF-8.                                       |
| `outputFile(name, ext, body)`  | Names the output and sets the right MIME type.                    |
| `baseName(filename)`           | Strips the extension.                                             |
| `fail(message, cause?)`        | Throws a `KilnError` — a message shown to the user verbatim.      |
| `describeFailure(cause, kind)` | Turns a library error into a sentence. Never leaks a stack.       |
| `interop(module)`              | Unwraps a CommonJS default the bundler double-wrapped.            |

## Conventions engines must follow

- **Throw an `Error` whose message is the interface's voice.** It is rendered
  verbatim under the failed row. `This PDF has no extractable text. It may be a
scan.` — not `ENOTEXT`, not `Oops, something went wrong.` State what happened
  and what to do about it.
- **Name the output yourself**, normally `baseName(input.name)` plus the new
  extension.
- **Set `fidelity` honestly, and give every `lossy` pair a `caveat`.**
- **Put everything discarded in `warnings`.** Charts, images, a clipped column, a
  script the PDF font cannot draw. Silent loss is a bug.
- **Do nothing at module scope.** Everything heavy sits behind the `await
import()` inside the engine.
- **Never reach the network.** No CDN, no hosted API, no font fetch. A WASM blob
  from Kiln's own origin is fine; anything else is disqualified however good its
  output.
- **Refuse rather than return nothing.** A conversion that produces an empty file
  must throw with a reason.

---

# Worked example: RTF → PDF

A pair Kiln does not currently declare, built completely.

## 1. The engine

`lib/registry/converters/rtf-to-pdf.ts`

```ts
import type { ConversionResult } from '../types';
import { outputFile, readText } from '../shared';
import { parseRtf } from './_rtf';
import { blocksToPdfContent } from './_blocks-to-pdf';
import { pdfDocument, renderPdf, requireContent } from './_pdf';

export async function convert(input: File): Promise<ConversionResult> {
  // readText refuses an empty or oversized file with a sentence the interface
  // can show, rather than letting the parser fail obscurely.
  const paragraphs = parseRtf(await readText(input));

  const { content, warnings } = blocksToPdfContent(paragraphs);
  const render = await renderPdf(pdfDocument(requireContent(content, 'text')));

  // Clipped tables, unrenderable scripts, and anything this engine dropped
  // itself. The user is told, or it did not happen.
  const notes = [...warnings, ...render.warnings];

  return {
    files: [outputFile(input.name, 'pdf', render.bytes)],
    warnings: notes.length ? notes : undefined,
  };
}
```

Note what is _not_ here: no `pdfmake` import at module scope — `_pdf.ts` holds
that behind its own dynamic import — and no `try`/`catch` swallowing errors. The
worker catches, logs the real cause to the console, and shows `describeFailure`'s
sentence.

## 2. The table entry

`lib/registry/index.ts`, in the text-documents block:

```ts
{
  from: 'rtf',
  to: 'pdf',
  fidelity: 'lossy',
  caveat:
    'Headings and emphasis are guessed from the font sizes RTF records, and the page is laid out again from scratch. Tables and images are dropped.',
},
```

`lossy`, because structure is inferred rather than read — so a `caveat` is
mandatory, and it says what is lost in the user's terms.

## 3. The wiring

`lib/registry/engines.ts`:

```ts
'rtf>pdf': () => import('./converters/rtf-to-pdf').then((m) => m.convert),
```

## 4. The fixture

`sample.rtf` already exists, generated by `scripts/make-fixtures.mjs` from Kiln's
own RTF writer. If the pair needed something new, it goes in the same script —
never a hand-rolled byte string, because a fixture that only looks like an RTF
would let a broken reader pass:

```js
// scripts/make-fixtures.mjs
{
  const { writeRtf } = await import('../lib/registry/converters/_rtf.ts');
  write(
    'headings.rtf',
    writeRtf([
      { kind: 'heading', level: 1, text: 'Quarterly report' },
      { kind: 'paragraph', text: MARKER },
    ]),
  );
}
```

Then `pnpm fixtures`.

## 5. The test

The table-driven block in `converters.test.ts` covers the new pair automatically.
Add the content assertion beside the others:

```ts
it('rtf → pdf keeps the words and the heading', async () => {
  const convert = await engineFor('rtf', 'pdf')!();
  const result = await convert(fixture('sample.rtf'));

  // Read the text layer back. A non-empty PDF proves nothing.
  const { readPdf } = await import('./_pdfread');
  const bytes = new Uint8Array(await result.files[0]!.blob.arrayBuffer());
  const { lines } = await readPdf(new File([bytes], 'read.pdf'));
  const text = lines.map((line) => line.text).join('\n');

  expect(text).toContain(MARKER);
  expect(text).toContain('Plain paragraph text.');
  expect(text).not.toContain('\\rtf'); // no control words leaked through
});
```

Then run the `probe` skill's checklist against `rtf → pdf` — at minimum the
encoding cases, the long-line case and the corrupt-file case.

## 6. What you did not touch

No component. `.pdf` now appears in the picker for any dropped `.rtf`, the caveat
shows before the conversion starts, and the unsupported-pairs note updates on its
own.
