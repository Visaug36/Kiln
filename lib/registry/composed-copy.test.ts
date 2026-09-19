import { describe, expect, it } from 'vitest';
import { engineFor } from './engines';
import { find } from './routing';
import { runRoute } from './run-route';
import { fixture, said } from '@/test/fixtures';
import type { Warning } from './types';

/**
 * Copy must survive composition.
 *
 * Seventy of Recast's 114 pairs are two converters run back to back, so a
 * sentence written for one edge is shown on every pair routed through it. The
 * failure is always the same shape: advice addressed to whoever wrote the file
 * the second engine read — which, on a routed pair, is Recast, from a document
 * the reader never saw in that form at all.
 *
 * These tests are the standing check. They run the real engines over the real
 * fixtures rather than asserting on source strings, because the bug is what a
 * person ends up reading, not what a file contains.
 */

/** Runs a pair for real, direct or routed, and hands back its warnings. */
async function warningsFor(from: string, to: string, name: string): Promise<Warning[]> {
  const route = find(from as never, to as never);
  if (!route) throw new Error(`no route for ${from} → ${to}`);
  const result = await runRoute(route, fixture(name));
  return result.warnings ?? [];
}

describe('advice is only given to a reader who can take it', () => {
  it('does not tell somebody who dropped a workbook to add Markdown headings', async () => {
    // The recorded bug. `xlsx → epub` routes through Markdown that Recast wrote
    // from a grid of cells, and used to answer with "Add `#` headings to split
    // it up" — an instruction about a file the reader has never seen.
    const warnings = await warningsFor('xlsx', 'epub', 'sample.xlsx');
    const text = said(warnings);

    expect(text).not.toMatch(/Add `?#/i);
    expect(text).not.toMatch(/headings to split/i);
  }, 60_000);

  it('still says what happened, which was the true half of that sentence', async () => {
    const convert = await engineFor('md', 'epub')!();
    // No top-level heading, so the whole document is one chapter.
    const source = new File(
      ['Just a paragraph, with no heading above it.\n'],
      'notes.md',
    );
    const warnings = (await convert(source)).warnings ?? [];

    const chapter = warnings.find((w) => /single chapter/i.test(w.message));
    expect(chapter).toBeDefined();
    expect(chapter?.message).toBe(
      'The document had no top-level headings, so it became a single chapter.',
    );
    // Everything is present, reorganised — not lost.
    expect(chapter?.severity).toBe('changed');
  }, 60_000);

  it('does not tell somebody who dropped a document to split up their headings', async () => {
    const { deckWarnings } = await import('./converters/_slides');
    const overfull = [
      {
        title: 'One slide',
        bullets: Array.from({ length: 14 }, (_, i) => ({ text: `item ${i}`, depth: 0 })),
      },
    ];

    const warnings = deckWarnings('# One slide\n', overfull);
    const text = said(warnings);

    expect(text).toMatch(/more than 12 bullets/);
    expect(text).not.toMatch(/split those/i);
  });

  it('never names Markdown to a reader who did not hand Recast any', async () => {
    // Eleven pairs reach a book through Markdown and two reach a deck that
    // way. On every one of them the Markdown is Recast's, so naming it in a
    // warning describes a file that never existed for the person reading.
    for (const [from, to, name] of [
      ['xlsx', 'epub', 'sample.xlsx'],
      ['txt', 'pptx', 'sample.txt'],
      ['odt', 'epub', 'sample.odt'],
    ] as const) {
      const text = said(await warningsFor(from, to, name));
      expect(text, `${from} → ${to}`).not.toMatch(/Markdown/);
    }
  }, 120_000);
});

describe('every warning is classified where it is written', () => {
  it('gives each one of the three severities, on direct and routed pairs alike', async () => {
    for (const [from, to, name] of [
      ['odt', 'html', 'sample.odt'],
      ['xlsx', 'epub', 'sample.xlsx'],
      ['pdf', 'md', 'sample.pdf'],
      ['epub', 'md', 'sample.epub'],
    ] as const) {
      const warnings = await warningsFor(from, to, name);
      expect(warnings.length, `${from} → ${to} said nothing`).toBeGreaterThan(0);

      for (const warning of warnings) {
        expect(['lost', 'changed', 'note'], warning.message).toContain(warning.severity);
      }
    }
  }, 120_000);
});
