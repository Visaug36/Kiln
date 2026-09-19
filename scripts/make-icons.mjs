/**
 * Draws the app icon and writes every size the page asks for.
 *
 * The mark is the staff from `design/Recast.dc.html`: a shaft with a cut stone
 * at its head, on the ink-plum field. Two primitives and no ornament — Recast
 * as in recasting a spell, so the idea carries the joke and the drawing stays
 * as precise as the rest of the interface.
 *
 * The design draws it upright. It is tilted here, because a staff standing
 * perfectly vertical reads as a diagram of a staff and a tilted one reads as an
 * object somebody is holding. The angle is the whole question at 16px, where
 * the shaft is under two device pixels wide: see `TILT` below.
 *
 * Run with `pnpm icons`. Chromium rasterises, because the thing being judged is
 * how a browser rasterises it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public');

/** Ink-plum, and the near-white the mark is cut out in. Both from the design. */
const PLUM = '#5b1d8e';
const CUT = '#f6f0fc';

/**
 * Degrees off vertical.
 *
 * 12°, and the deciding evidence was not 16px — it was 512px.
 *
 * Rendered at 0, 9, 10, 11, 12, 13 and 15 and looked at, the head stops
 * crowning the shaft somewhere between 12 and 13. The stone is 24 units across
 * on a 7-unit shaft, so past that angle its lower facet swings clear of the
 * shaft's edge and opens a notch on the left — which is the silhouette of an
 * axe, and at 15° that is plainly what it looks like. A tilt that changes what
 * the object *is* costs more than a tilt that costs a pixel.
 *
 * 16px was legible at every angle tried, so it did not decide anything: the
 * head is a distinct blob above the stroke from 0 to 13. 12° is therefore the
 * ceiling rather than the floor of what works here, not the middle of a range.
 */
const TILT = 12;

/** Rotated about the staff's own middle, not the tile's, so it pivots where a
 *  held object would. */
const PIVOT = { x: 32, y: 30 };

/**
 * The mark at 64 units.
 *
 * `field` draws the plum tile behind it; the favicon and the PNGs want it, and
 * a mark sitting on the page's own background does not.
 */
export function staffSvg({ field = true, fill = CUT, size = 64 } = {}) {
  const tile = field ? `<rect width="64" height="64" rx="12" fill="${PLUM}"/>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${tile}<g transform="rotate(${TILT} ${PIVOT.x} ${PIVOT.y})"><rect x="28.5" y="24" width="7" height="34" rx="1.5" fill="${fill}"/><path d="M32 3 44 15 32 27 20 15z" fill="${fill}"/></g></svg>`;
}

const SIZES = [16, 32, 180, 512];

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(out, { recursive: true });

  const svg = staffSvg();
  writeFileSync(join(out, 'icon.svg'), `${svg}\n`);
  console.log('icon.svg');

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();

  for (const size of SIZES) {
    await page.setViewportSize({ width: size, height: size });
    // No page margin and no background, so the PNG is exactly the mark.
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${staffSvg({ size })}</body></html>`,
    );
    const bytes = await page.screenshot({ omitBackground: true });
    writeFileSync(join(out, `icon-${size}.png`), bytes);
    console.log(`icon-${size}.png — ${bytes.length} bytes`);
  }

  await browser.close();
}
