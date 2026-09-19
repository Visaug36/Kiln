import type { Format } from '@/lib/registry/types';

/**
 * One format's tile: its letterform, in its own colour.
 *
 * The point is that a row is identifiable before its label is read — `.docx`
 * blue with a W, `.xlsx` green with an X, the OpenDocument three with the bar
 * under the letter that marks them as the open siblings of the three above.
 *
 * Drawn, not fetched. Fourteen image files would be fourteen more requests on
 * a page whose whole claim is that it makes none, and an SVG inherits the
 * interface's own typeface instead of shipping a second copy of it.
 *
 * `Record<Format, Tile>` is doing real work: adding a format to the union
 * fails the typecheck until it has a tile, which is what keeps this from
 * becoming a list that silently falls behind `lib/registry`.
 */

interface Tile {
  /** The field colour. Each format's own, from `design/Recast.dc.html`. */
  fill: string;
  /** The letterform, and what colour it is cut in. */
  text: string;
  ink: string;
  size: number;
  /** Baseline, tuned per letterform so each sits optically centred. */
  y: number;
  tracking?: number;
  /**
   * The bar under an OpenDocument letter.
   *
   * ODT/ODS/ODP carry the same letters as their Microsoft counterparts because
   * that is what they are — a text document, a sheet, a deck. The bar is what
   * separates them at a glance without a second letter to read.
   */
  bar?: string;
  /**
   * A CSS variable to draw from instead of `fill`/`ink`.
   *
   * Only Markdown needs one: its near-black field is the format's identity and
   * is invisible on a dark card, so it inverts with the theme. `fill` and `ink`
   * stay as the fallback and as what the test compares against.
   */
  themed?: { fill: string; ink: string };
}

const TILES: Record<Format, Tile> = {
  pdf: {
    fill: '#c8332b',
    text: 'PDF',
    ink: '#ffffff',
    size: 8.4,
    y: 16.1,
    tracking: -0.3,
  },
  docx: { fill: '#23509c', text: 'W', ink: '#ffffff', size: 13, y: 17 },
  xlsx: { fill: '#1a6f41', text: 'X', ink: '#ffffff', size: 13, y: 17 },
  pptx: { fill: '#b8431a', text: 'P', ink: '#ffffff', size: 13, y: 17 },
  epub: { fill: '#17666b', text: 'E', ink: '#ffffff', size: 13, y: 17 },
  odt: {
    fill: '#35659f',
    text: 'W',
    ink: '#ffffff',
    size: 11.5,
    y: 16.4,
    bar: '#ffffff',
  },
  ods: {
    fill: '#237549',
    text: 'X',
    ink: '#ffffff',
    size: 11.5,
    y: 16.4,
    bar: '#ffffff',
  },
  odp: {
    fill: '#c98a1e',
    text: 'P',
    ink: '#1d1a10',
    size: 11.5,
    y: 16.4,
    bar: '#1d1a10',
  },
  html: {
    fill: '#d9731a',
    text: 'HTML',
    ink: '#1d1408',
    size: 6.6,
    y: 15.9,
    tracking: -0.25,
  },
  md: {
    fill: '#1f1d26',
    text: 'MD',
    ink: '#ffffff',
    size: 10.4,
    y: 16.6,
    tracking: -0.4,
    themed: { fill: 'var(--format-md)', ink: 'var(--format-md-ink)' },
  },
  txt: {
    fill: '#6b6577',
    text: 'TXT',
    ink: '#ffffff',
    size: 8.2,
    y: 16.2,
    tracking: -0.3,
  },
  rtf: {
    fill: '#4a6a8c',
    text: 'RTF',
    ink: '#ffffff',
    size: 8.2,
    y: 16.2,
    tracking: -0.3,
  },
  csv: {
    fill: '#5fae6b',
    text: 'CSV',
    ink: '#102e16',
    size: 8.2,
    y: 16.2,
    tracking: -0.3,
  },
  json: {
    fill: '#c9a227',
    text: 'JSON',
    ink: '#241c00',
    size: 6.6,
    y: 15.9,
    tracking: -0.25,
  },
};

interface FormatIconProps {
  format: Format;
  /** Rendered size in pixels. 20 in a job row, 30 on a format tile. */
  size?: number;
  className?: string;
}

export default function FormatIcon({ format, size = 20, className }: FormatIconProps) {
  const tile = TILES[format];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      role="img"
      // The filename beside it already says `.docx`; a second announcement of
      // the same fact is noise in a screen reader.
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="1.5"
        y="1.5"
        width="21"
        height="21"
        rx="4.5"
        fill={tile.themed?.fill ?? tile.fill}
      />
      <text
        x="12"
        y={tile.y}
        textAnchor="middle"
        fontFamily="var(--font-grotesk), ui-sans-serif, system-ui, sans-serif"
        fontWeight="700"
        fontSize={tile.size}
        letterSpacing={tile.tracking}
        fill={tile.themed?.ink ?? tile.ink}
      >
        {tile.text}
      </text>
      {tile.bar && (
        <rect
          x="4.6"
          y="18.4"
          width="14.8"
          height="1.7"
          rx="0.85"
          fill={tile.bar}
          opacity={tile.bar === '#ffffff' ? 0.85 : 0.8}
        />
      )}
    </svg>
  );
}
