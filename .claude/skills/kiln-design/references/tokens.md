# Kiln's tokens, verbatim

The canonical written copy of every design value, taken from `app/globals.css`.
If the two ever disagree, `globals.css` is what ships — fix both.

## Colour

Nine colours plus one accessibility step. Every colour in Kiln is one of these.

| Token        | Tailwind           | Light     | Dark      | Use                            |
| ------------ | ------------------ | --------- | --------- | ------------------------------ |
| `canvas`     | `bg-canvas`        | `#fcfcfa` | `#161513` | Page background                |
| `surface`    | `bg-surface`       | `#ffffff` | `#1f1e1c` | Cards, rows, raised things     |
| `fill`       | `bg-fill`          | `#f3f2ef` | `#262522` | Inset wells, secondary buttons |
| `separator`  | `border-separator` | `#e6e4df` | `#33322e` | Every border                   |
| `label`      | `text-label`       | `#1d1c1a` | `#f5f4f1` | Primary text                   |
| `secondary`  | `text-secondary`   | `#6e6c68` | `#a5a29c` | Supporting text                |
| `tertiary`   | `text-tertiary`    | `#a5a29c` | `#6e6c68` | Hints, disabled                |
| `ember`      | `bg/border-ember`  | `#d2551f` | `#ff7a45` | The accent: fills, focus ring  |
| `ember-tint` | `bg-ember-tint`    | `#fbeee7` | `#2a1a12` | The accent's background wash   |
| `ember-text` | `text-ember-text`  | `#b8491a` | `#ff7a45` | Ember carrying small text      |

`secondary` and `tertiary` **swap** between light and dark; they are not the same
grey stepped in one direction.

### Why `ember-text` exists

`#d2551f` reaches only **4.04:1** on canvas, short of AA for 15px text.
`ember-text` is a darker step used **solely** where ember has to carry small
text. As a fill, border, tint or focus ring, ember itself is unchanged. In dark
mode the two are the same value, because `#ff7a45` already passes.

### Derived

```css
--canvas-blur: color-mix(in srgb, var(--canvas) 80%, transparent);
```

Derived once from `--canvas`, so it follows whichever palette is active.

### How the themes are selected

```css
@custom-variant dark (&:where(.dark, .dark *));
```

- `:root` holds the light palette and `color-scheme: light`.
- `@media (prefers-color-scheme: dark) { :root:not(.light) { … } }` — the OS
  preference, unless `.light` is forced.
- `:root.dark { … }` — forced dark, same values.

So `.dark` or `.light` on `<html>` overrides the OS; with neither, the OS
decides.

### How the tokens reach Tailwind

```css
@theme inline {
  --color-canvas: var(--canvas);
  --color-surface: var(--surface);
  --color-fill: var(--fill);
  --color-separator: var(--separator);
  --color-label: var(--label);
  --color-secondary: var(--secondary);
  --color-tertiary: var(--tertiary);
  --color-ember: var(--ember);
  --color-ember-tint: var(--ember-tint);
  --color-ember-text: var(--ember-text);
  --color-canvas-blur: var(--canvas-blur);
}
```

`inline` is load-bearing: it keeps the `var()` reference intact, so a utility
follows the live theme instead of baking in the light-mode value at build time.

## Type

```css
--font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
--font-mono: var(--font-plex-mono), ui-monospace, monospace;
```

Both loaded by `next/font` at build time and served from Kiln's own origin.

| Step      | Token          | Size | Line height | Weight | Tracking |
| --------- | -------------- | ---- | ----------- | ------ | -------- |
| `hero`    | `text-hero`    | 48px | 1.08        | 600    | -0.025em |
| `heading` | `text-heading` | 19px | 26px        | 500    | —        |
| `body`    | `text-body`    | 15px | 24px        | 400    | —        |

```css
--text-hero: 48px;
--text-hero--line-height: 1.08;
--text-hero--font-weight: 600;
--text-hero--letter-spacing: -0.025em;

--text-heading: 19px;
--text-heading--line-height: 26px;
--text-heading--font-weight: 500;

--text-body: 15px;
--text-body--line-height: 24px;
--text-body--font-weight: 400;
```

`body` sets 15px / 24px / 400 as the document default, with
`-webkit-font-smoothing: antialiased` and `-webkit-text-size-adjust: 100%` on
`html`.

Filenames, format badges and code use `font-mono` at `13px` with `leading-5`.

## Shape and depth

```css
--radius-control: 12px;
--radius-drop: 20px;

--shadow-kiln: 0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px rgb(0 0 0 / 0.06);
```

Radius 12 on controls (`rounded-control`), 20 on the drop zone (`rounded-drop`).
Nothing else has a radius.

One shadow, two layers: a 1px contact shadow at 4% and a 24px ambient at 6%.
There is no second elevation.

Borders are hairlines only, applied globally:

```css
*,
::before,
::after {
  border-color: var(--separator);
}
```

Focus, never removed:

```css
:focus-visible {
  outline: 2px solid var(--ember);
  outline-offset: 2px;
  border-radius: 4px;
}
```

## Motion

One curve, one duration.

```css
--ease-kiln: cubic-bezier(0.32, 0.72, 0, 1);
```

```css
.kiln-motion {
  transition-property: transform, background-color, border-color, color, opacity;
  transition-duration: 250ms;
  transition-timing-function: var(--ease-kiln);
}

.kiln-dropzone--active {
  transform: scale(1.012);
  background-color: var(--ember-tint);
  border-color: var(--ember);
}

.kiln-row-enter {
  animation: kiln-rise 250ms var(--ease-kiln) both;
}

@keyframes kiln-rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
```

The drop-zone scale is **1.012** — a tenth of the way to anything you would
notice consciously. That restraint is the point.

### Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  .kiln-motion {
    transition-property: opacity, background-color, border-color, color;
  }

  .kiln-dropzone--active {
    transform: none;
  }

  .kiln-row-enter {
    animation: kiln-fade 250ms linear both;
  }

  @keyframes kiln-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
}
```

Transform is dropped from the transition list and from the drop-zone state; the
row entrance becomes a linear fade over the **same 250 ms**. Colour and opacity
still animate. Reduced motion is less movement, not an instant cut.
