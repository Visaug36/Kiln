// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fixture } from '@/test/fixtures';
import { find } from './routing';
import { runRoute } from './run-route';

/**
 * The hand-off between two converters.
 *
 * Most pairs Recast offers are two engines run back to back, and nothing in the
 * unit suite exercised the joint between them until this existed: both halves
 * were tested, and the thing that carries a file from one to the other was not.
 */

async function convert(
  from: Parameters<typeof find>[0],
  to: Parameters<typeof find>[1],
  name: string,
) {
  const route = find(from, to);
  expect(route, `${from} → ${to} has no route`).toBeDefined();
  return { route: route!, result: await runRoute(route!, fixture(name)) };
}

describe('running a route', () => {
  it('feeds the first step’s real file into the second', async () => {
    const { route, result } = await convert('epub', 'odt', 'sample.epub');

    expect(route.via).toBe('md');
    expect(result.files).toHaveLength(1);
    expect(result.files[0]!.filename).toBe('sample.odt');
    expect(result.files[0]!.blob.size).toBeGreaterThan(0);

    // The document is still in there after two conversions.
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await result.files[0]!.blob.arrayBuffer());
    const content = await zip.file('content.xml')!.async('string');
    expect(content).toContain('Chapter one');
    expect(content).toContain('Recast fixture marker 4711');
  }, 60_000);

  it('names the step each warning came from', async () => {
    const { result } = await convert('odt', 'html', 'sample.odt');
    const warnings = result.warnings ?? [];

    expect(warnings.length).toBeGreaterThan(0);
    // "Images were dropped" reads very differently depending on which half of
    // the conversion dropped them.
    expect(warnings.every((w) => /^\.\w+ → \.\w+: /.test(w))).toBe(true);
    expect(warnings.join(' ')).toContain('.odt → .md: An image was not carried over');
  }, 60_000);

  it('leaves a single-step pair’s warnings unlabelled', async () => {
    const { result } = await convert('odt', 'md', 'sample.odt');
    expect((result.warnings ?? []).some((w) => /^\.\w+ → \.\w+: /.test(w))).toBe(false);
  }, 60_000);

  it('runs the second step over every file the first produced', async () => {
    // The workbook has two sheets, so `xlsx → csv` honestly produces two files
    // and `ods → csv → …` has to carry both rather than the first one.
    const { result } = await convert('ods', 'csv', 'sample.ods');
    expect(result.files.map((f) => f.filename).sort()).toEqual([
      'sample-notes.csv',
      'sample-sales.csv',
    ]);
  }, 60_000);

  it('keeps the original document’s name, not the intermediate’s', async () => {
    const { result } = await convert('html', 'epub', 'sample.html');
    expect(result.files[0]!.filename).toBe('sample.epub');
  }, 60_000);

  it('gives the same result as running the two steps by hand', async () => {
    // The promise a routed pair makes: nothing is smuggled across the join.
    const { engineFor } = await import('./engines');

    const first = await engineFor('html', 'md')!();
    const middle = (await first(fixture('sample.html'))).files[0]!;
    const second = await engineFor('md', 'rtf')!();
    const byHand = (
      await second(new File([await middle.blob.arrayBuffer()], middle.filename))
    ).files[0]!;

    const { result } = await convert('html', 'rtf', 'sample.html');

    expect(await result.files[0]!.blob.text()).toBe(await byHand.blob.text());
  }, 60_000);
});
