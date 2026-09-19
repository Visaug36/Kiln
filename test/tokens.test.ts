import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The written copy of the design values has to be the values that ship.
 *
 * `tokens.md` is what anybody building a component reads; `globals.css` is what
 * the browser gets. A reference that quietly drifts from the implementation is
 * worse than no reference, because it is trusted — the same failure as a caveat
 * that stopped being true, one layer down.
 *
 * So this parses both and compares them. It is deliberately strict about the
 * colours: those are the ones a person copies out by hand.
 */

const root = process.cwd();
const css = readFileSync(join(root, 'app', 'globals.css'), 'utf8');
const md = readFileSync(
  join(root, '.claude', 'skills', 'recast-design', 'references', 'tokens.md'),
  'utf8',
);

/** The custom properties declared in one block, as name → value. */
function block(selector: string): Record<string, string> {
  const at = css.indexOf(selector);
  if (at === -1) throw new Error(`no ${selector} block in globals.css`);

  const open = css.indexOf('{', at);
  const close = css.indexOf('\n}', open);
  const body = css.slice(open, close);

  const values: Record<string, string> = {};
  for (const line of body.matchAll(/--([a-z-]+):\s*([^;]+);/g)) {
    values[line[1]!] = line[2]!.trim();
  }
  return values;
}

/** Every colour row of the token table: name → { light, dark }. */
function documentedColours(): Record<string, { light: string; dark: string }> {
  const rows: Record<string, { light: string; dark: string }> = {};
  for (const row of md.matchAll(
    /^\|\s*`([a-z-]+)`\s*\|[^|]*\|\s*`(#[0-9a-f]{6})`\s*\|\s*`(#[0-9a-f]{6})`\s*\|/gm,
  )) {
    rows[row[1]!] = { light: row[2]!, dark: row[3]! };
  }
  return rows;
}

const light = block(':root {');
const dark = block(':root.dark {');
const media = block(':root:not(.light) {');
const documented = documentedColours();

describe('tokens.md and globals.css agree', () => {
  it('documents a colour for every one the stylesheet declares', () => {
    const declared = Object.keys(light).filter(
      (name) => light[name]!.startsWith('#') && name !== 'canvas-blur',
    );

    expect(declared.length).toBeGreaterThan(10);
    expect(Object.keys(documented).sort()).toEqual(declared.sort());
  });

  it('matches every light and dark value', () => {
    for (const [name, values] of Object.entries(documented)) {
      expect(light[name], `${name} light`).toBe(values.light);
      expect(dark[name], `${name} dark`).toBe(values.dark);
    }
  });

  it('keeps the media-query palette identical to the forced one', () => {
    // `.dark` on <html> and prefers-color-scheme have to produce the same
    // page. They are two blocks, so nothing but a test keeps them in step.
    for (const name of Object.keys(documented)) {
      expect(media[name], `${name} under prefers-color-scheme`).toBe(dark[name]);
    }
  });

  it('documents the radii the stylesheet defines', () => {
    expect(md).toContain('--radius-control: 8px;');
    expect(md).toContain('--radius-chip: 4px;');
    expect(css).toContain('--radius-control: 8px;');
    expect(css).toContain('--radius-chip: 4px;');
  });

  it('documents the one motion curve', () => {
    const curve = 'cubic-bezier(0.32, 0.72, 0, 1)';
    expect(css).toContain(curve);
    expect(md).toContain(curve);
  });
});

describe('the stylesheet itself', () => {
  it('names no colour outside the palette blocks', () => {
    // A hex literal in a component is a bug even when it happens to match.
    // Here it would be one in the stylesheet: every utility must resolve to a
    // token so both themes follow it.
    const afterPalette = css.slice(css.indexOf('@theme inline'));
    const literals = [...afterPalette.matchAll(/#[0-9a-f]{3,8}\b/gi)];
    expect(literals.map((m) => m[0])).toEqual([]);
  });
});
