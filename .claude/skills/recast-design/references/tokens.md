# Recast's tokens, verbatim

The canonical written copy of every design value, taken from `app/globals.css`,
which takes them from `design/Recast.dc.html`. If any two disagree,
`globals.css` is what ships — and `test/tokens.test.ts` fails until this file
matches it.

## Colour

Eighteen values: four surfaces, four text weights, eight for the brand, plus
one derived. Every colour in the interface is one of these, except the fourteen
format tiles, which are each format's own and live in `components/FormatIcon.tsx`.

| Token           | Tailwind            | Light     | Dark      | Use                                   |
| --------------- | ------------------- | --------- | --------- | ------------------------------------- |
| `canvas`        | `bg-canvas`         | `#f7f6f9` | `#121016` | Page background                       |
| `surface`       | `bg-surface`        | `#ffffff` | `#1a1720` | Header, cards, footer                 |
| `fill`          | `bg-fill`           | `#f3f1f7` | `#2c2836` | Inset wells                           |
| `separator`     | `border-separator`  | `#e4e1eb` | `#2c2836` | Every hairline                        |
| `control`       | `border-control`    | `#d6d2e0` | `#3a3546` | Buttons and inputs, one step stronger |
| `label`         | `text-label`        | `#16141c` | `#f3f1f7` | Primary text, and the Lost block      |
| `ink`           | `text-ink`          | `#35303f` | `#cdc6d8` | Running prose                         |
| `secondary`     | `text-secondary`    | `#5d5866` | `#a29cb0` | Supporting text                       |
| `tertiary`      | `text-tertiary`     | `#8b8497` | `#6b6577` | Hints, the step on a routed warning   |
| `plum`          | `bg-plum`           | `#5b1d8e` | `#7a34b8` | The hero field, buttons, focus ring   |
| `plum-deep`     | `bg-plum-deep`      | `#4a1570` | `#5a1f8a` | Chips sitting on the plum field       |
| `plum-text`     | `text-plum-text`    | `#6b2199` | `#c9a2f2` | Plum carrying text on canvas          |
| `plum-edge`     | `border-plum-edge`  | `#d8bff0` | `#4a2a6b` | The drop zone's dashed border         |
| `plum-wash`     | `bg-plum-wash`      | `#faf6fe` | `#1f1530` | Drop zone interior, converting card   |
| `plum-track`    | `bg-plum-track`     | `#eee3f8` | `#2a1d3d` | The progress bar's groove             |
| `on-plum`       | `text-on-plum`      | `#f8f5ff` | `#f8f5ff` | Text on a plum field                  |
| `on-plum-soft`  | `text-on-plum-soft` | `#f0e7ff` | `#f0e7ff` | Supporting text on a plum field       |
| `format-md`     | (SVG `fill`)        | `#1f1d26` | `#f3f1f7` | The Markdown tile's field             |
| `format-md-ink` | (SVG `fill`)        | `#ffffff` | `#1f1d26` | The Markdown tile's letterform        |

`format-md` is the only format tile with a theme. The other thirteen keep one
colour in both, and all fourteen live in `components/FormatIcon.tsx`; Markdown's
field is near-black, which is the format's identity and is invisible against a
dark card, so it inverts rather than greying into the neighbouring `txt` tile.

`on-plum` and `on-plum-soft` are the same in both themes on purpose: they sit on
plum, which is itself a token, so they follow it rather than the page.

### Why `ink` is not called `body`

Tailwind resolves `text-<name>` against both the font-size and the colour
namespaces. With a `--text-body` size **and** a `--color-body`, `text-body`
means whichever one Tailwind reaches first — so the colour is `ink` and the
size keeps `body`. The two never collide.

### The Lost block

It has no tokens of its own. It is `bg-label` with `text-surface`, which makes
it the theme inverted — a dark block in light mode, a light one in dark. The
detail line inside it is `text-separator`, which is legible against `label` in
both.

### Derived

```css
--canvas-blur: color-mix(in srgb, var(--surface) 82%, transparent);
```

Derived from `--surface`, so the sticky header follows whichever palette is
active.

## Type

Schibsted Grotesk for the interface, Spline Sans Mono for filenames, format
codes and anything counted. Both self-hosted through `next/font` — **no font
CDN is ever contacted**, which is a privacy requirement rather than a
performance one, and is asserted by `pnpm verify:browser`.

| Token      | Size   | Line | Weight | Tracking | Use                             |
| ---------- | ------ | ---- | ------ | -------- | ------------------------------- |
| `hero`     | 44px   | 1.08 | 800    | -0.025em | The one h1                      |
| `title`    | 29px   | 1.2  | 700    | -0.02em  | Section heading                 |
| `section`  | 26px   | 1.2  | 700    | -0.02em  | Page heading below the hero     |
| `heading`  | 19px   | 1.3  | 700    | —        | About, and subheads             |
| `wordmark` | 21px   | 1    | 700    | -0.015em | "Recast" in the header          |
| `lead`     | 17px   | 1.6  | 400    | —        | The hero paragraph              |
| `prose`    | 15.5px | 1.65 | 400    | —        | Running prose                   |
| `body`     | 15px   | 20px | 400    | —        | Controls and labels             |
| `small`    | 14.5px | 1.55 | 400    | —        | Captions, caveats, notices      |
| `lost`     | 19px   | 1.4  | 500    | —        | A `lost` warning, and only that |

`lost` is a type token because the hierarchy is the point: the sentence saying
something is gone is set larger than any other warning text on the row.

## Shape

```css
--radius-control: 8px; /* cards, buttons, inputs, the drop zone */
--radius-chip: 4px; /* hero chips, the Lost block, the progress bar */
```

Two radii, and nothing else has one.

## Motion

One curve for transitions, and two named animations the design specifies for a
conversion in flight.

```css
--ease-recast: cubic-bezier(0.32, 0.72, 0, 1); /* 250ms, via .recast-motion */
```

| Class               | What                                           |
| ------------------- | ---------------------------------------------- |
| `.recast-motion`    | 250ms on colour, border, opacity and transform |
| `.recast-caret`     | 150ms rotation on a notes disclosure           |
| `.recast-pulse`     | 2.2s ease-in-out, the word "Converting"        |
| `.recast-sheen`     | 2.4s linear, the highlight crossing the bar    |
| `.recast-row-enter` | 250ms rise as a row appears                    |

Under `prefers-reduced-motion: reduce`, transitions keep colour and opacity and
drop transform, the row entrance becomes a linear fade, the caret stops
animating, and the travelling sheen is removed entirely. The pulse stays: a
conversion in flight still has to look like one.

## Focus

```css
:focus-visible {
  outline: 2px solid var(--plum);
  outline-offset: 2px;
  border-radius: 4px;
}
```

Never removed.
