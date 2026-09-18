// @vitest-environment node
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { converters } from '@/lib/registry/table';
import { engines } from '@/lib/registry/engines';
import type { Format } from '@/lib/registry/types';

/**
 * What each declared edge costs: peak memory, and how much the file grows.
 *
 * Skipped unless `MEASURE=1` — it converts megabyte documents thirty-nine times
 * over and takes minutes. Run it with:
 *
 *     MEASURE=1 pnpm vitest run test/measure-memory.test.ts
 *
 * and paste the table it prints into `EDGE_COST` in `lib/files/capacity.ts`.
 * Keeping it here rather than in a scratch file is the point: these numbers go
 * stale the moment a library is upgraded, and a measurement nobody can repeat
 * is a guess with a decimal point on it.
 *
 * **Edges, not pairs.** Most pairs Recast offers are two edges run back to back,
 * and there are around a hundred of them; a hundred separately measured numbers
 * would drift out of step with each other and with the engines underneath.
 * Composing a route's cost from its edges is less work and more honest, and it
 * is how the conversion itself is built.
 */

const fixtures = join(process.cwd(), 'test', 'fixtures');
/** Roughly this much real content, built by repeating a fixture. */
const TARGET = 1_500_000;

interface Sized {
  file: File;
  /** Bytes of actual content, which is what the multiplier is against. */
  content: number;
}

const cache = new Map<Format, Sized>();

/**
 * The bytes an engine actually works on.
 *
 * For the seven ZIP-based formats that is the **unpacked** size, not the file's,
 * because that is what `sizeCaution` multiplies in production — `sniffOoxml`
 * reads it out of the archive while identifying it. Measuring against anything
 * else produces numbers that are systematically wrong for half the formats, in
 * a direction nobody would notice: a multiplier measured against a compressed
 * file is several times too large, and then applied to the uncompressed one.
 */
async function contentSize(file: File, format: Format): Promise<number> {
  if (!PACKED.has(format)) return file.size;

  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  let total = 0;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    total +=
      (entry as unknown as { _data?: { uncompressedSize?: number } })._data
        ?.uncompressedSize ?? 0;
  }
  return total || file.size;
}

const PACKED = new Set<Format>(['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'epub']);

async function through(pair: string, input: Sized, name: string): Promise<Sized> {
  const convert = await engines[pair]!();
  const out = (await convert(input.file)).files[0]!;
  const bytes = new Uint8Array(await out.blob.arrayBuffer());
  const file = new File([bytes], name);
  const format = name.split('.').pop() as Format;
  return { file, content: await contentSize(file, format) };
}

async function inputFor(format: Format): Promise<Sized> {
  const cached = cache.get(format);
  if (cached) return cached;

  const built = await build(format);
  cache.set(format, built);
  return built;
}

async function build(format: Format): Promise<Sized> {
  const plain: Partial<Record<Format, string>> = {
    md: 'sample.md',
    txt: 'sample.txt',
    csv: 'sample.csv',
    html: 'sample.html',
    json: 'sample.json',
  };

  const seed = plain[format];
  if (seed) {
    const one = readFileSync(join(fixtures, seed));
    const body = Buffer.concat(
      Array.from({ length: Math.ceil(TARGET / one.length) }, () => one),
    );
    // Repeating a JSON array would not parse; one large array is built instead.
    const data =
      format === 'json'
        ? Buffer.from(
            JSON.stringify(
              Array.from({ length: 6000 }, (_, i) => ({
                region: `Region ${i}`,
                units: i,
                revenue: i * 20,
                lead: { name: `Lead ${i}`, office: 'Leeds' },
              })),
            ),
          )
        : body;
    return { file: new File([data], `big.${format}`), content: data.length };
  }

  // Everything else is built by converting a large Markdown or CSV document
  // into it, so each input is a real document rather than a fixture repeated
  // until a parser chokes on it.
  if (format === 'xlsx') return through('csv>xlsx', await inputFor('csv'), 'big.xlsx');
  if (format === 'ods') return through('xlsx>ods', await inputFor('xlsx'), 'big.ods');

  return through(`md>${format}`, await inputFor('md'), `big.${format}`);
}

/**
 * One conversion, watched.
 *
 * Two readings, because neither alone is trustworthy. The sampler catches a
 * conversion that yields — most of them do, at every `await` — but misses a
 * synchronous burst entirely, since the timer cannot fire while the burst is
 * running. The reading taken the instant the conversion returns, *before* any
 * collection, catches that case: the garbage is still on the heap.
 *
 * `--expose-gc` is required rather than optional. Without a forced collection
 * the baseline is whatever the previous edge happened to leave behind, and a
 * collection landing mid-conversion silently halves the answer — which is how
 * a first run had `docx → txt` at ×1 sitting beside `docx → md` at ×828, two
 * pairs that share a reader.
 */
async function measure(from: Format, to: Format) {
  if (!global.gc) {
    throw new Error('run with NODE_OPTIONS=--expose-gc, or the numbers are noise');
  }

  const { file, content } = await inputFor(from);
  const convert = await engines[`${from}>${to}`]!();

  global.gc();
  const before = process.memoryUsage().heapUsed;
  let peak = before;
  const watch = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage().heapUsed);
  }, 1);

  let produced = 0;
  try {
    const result = await convert(file);
    // Before anything is collected, and before the result goes out of scope.
    peak = Math.max(peak, process.memoryUsage().heapUsed);
    for (const out of result.files) produced += out.blob.size;
  } finally {
    clearInterval(watch);
  }

  return {
    peak: Math.max(1, (peak - before) / content),
    growth: Math.max(0.01, produced / content),
  };
}

describe.skipIf(!process.env.MEASURE)('the cost of every edge', () => {
  it('measures peak memory and growth, worst of three runs', async () => {
    const lines: string[] = [];

    for (const { from, to } of converters) {
      let peak = 0;
      let growth = 0;
      // The first run pays for loading the library, and collection timing moves
      // the rest around. Take the worst of three.
      for (let run = 0; run < 3; run += 1) {
        const one = await measure(from, to);
        peak = Math.max(peak, one.peak);
        growth = Math.max(growth, one.growth);
      }

      const rounded = Math.max(5, Math.ceil((peak * 1.2) / 5) * 5);
      lines.push(
        `  '${from}>${to}': { peak: ${rounded}, growth: ${growth.toFixed(2)} }, // measured ×${peak.toFixed(0)}`,
      );
    }

    // Written to a file rather than logged: the runner swallows console output
    // from a test file, and a measurement you cannot read is not a measurement.
    const table = `// Paste into EDGE_COST in lib/files/capacity.ts\n${lines.join('\n')}\n`;
    writeFileSync(process.env.MEASURE_OUT ?? 'edge-cost.txt', table);
    expect(lines).toHaveLength(converters.length);
  }, 900_000);
});
