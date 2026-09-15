---
name: kiln-design
description: Use when building or changing any Kiln interface — a component, a screen, a colour, a typeface, a radius, a shadow, a transition, or user-facing copy. The canonical reference for Kiln's tokens, type scale, motion and voice.
---

# Kiln's design system

Nine colours, one typeface, one accent, one curve. The canonical source is
`app/globals.css`; this file is what it means.

**No component may contain a hardcoded colour.** Reference the Tailwind token
(`bg-surface`, `text-secondary`, `border-separator`) or the CSS variable. A hex
literal in a component is a bug even when it matches.

**Inter is a deliberate choice for this product, not a default reached for out of
habit.** Design skills commonly advise against it as overused. Kiln's tokens win;
see `CLAUDE.md`. Interface is Inter, code and filenames are IBM Plex Mono, both
self-hosted through `next/font` — no font CDN is ever contacted.

## Tokens

| Token        | Light     | Dark      | Use                            |
| ------------ | --------- | --------- | ------------------------------ |
| `canvas`     | `#fcfcfa` | `#161513` | Page background                |
| `surface`    | `#ffffff` | `#1f1e1c` | Cards, rows, raised things     |
| `fill`       | `#f3f2ef` | `#262522` | Inset wells, secondary buttons |
| `separator`  | `#e6e4df` | `#33322e` | Every border                   |
| `label`      | `#1d1c1a` | `#f5f4f1` | Primary text                   |
| `secondary`  | `#6e6c68` | `#a5a29c` | Supporting text                |
| `tertiary`   | `#a5a29c` | `#6e6c68` | Hints, disabled                |
| `ember`      | `#d2551f` | `#ff7a45` | The accent: fills, focus ring  |
| `ember-tint` | `#fbeee7` | `#2a1a12` | The accent's background wash   |
| `ember-text` | `#b8491a` | `#ff7a45` | Ember carrying small text      |

`#d2551f` reaches only 4.04:1 on canvas — short of AA for 15px text — so
`ember-text` is a darker step used **solely** where ember has to carry small
text. As a fill, border, tint or focus ring, ember is unchanged.

Dark mode follows `prefers-color-scheme` and can be forced with `.dark` or
`.light` on `<html>`. Tokens are exposed through `@theme inline`, which keeps the
`var()` reference intact so utilities follow the live theme rather than baking in
a light-mode value.

**Ember appears at most once per screen** — spent on the single firing job, and
nothing else. Everything else is warm neutral. Two ember elements on screen is a
regression; enforce it in review.

## Type

| Step      | Size | Line | Weight | Tracking |
| --------- | ---- | ---- | ------ | -------- |
| `hero`    | 48px | 1.08 | 600    | -0.025em |
| `heading` | 19px | 26px | 500    | —        |
| `body`    | 15px | 24px | 400    | —        |

## Shape and depth

- **Radius 12** on controls (`rounded-control`), **radius 20** on the drop zone
  (`rounded-drop`). Nothing else.
- **Hairline borders only** — 1px, always `separator`. Depth comes from the
  border and the shadow, never from a heavier rule.
- **One shadow**, two layers:
  `0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px rgb(0 0 0 / 0.06)` (`shadow-kiln`).
- Focus is a 2px `ember` outline at 2px offset. Never remove it.

## Motion

**One curve, one duration: `cubic-bezier(0.32, 0.72, 0, 1)` at 250 ms.** Applied
through `.kiln-motion`. Do not introduce a second easing or duration.

Under `prefers-reduced-motion: reduce`, transitions keep colour and opacity and
drop transform: the drop zone stops scaling, and the row entrance becomes a
linear fade over the same 250 ms. Reduced motion means less movement, not an
instant cut.

## Copy

Sentence case. Active voice. No exclamation marks. Say what happened and what to
do about it — never a raw exception, never "Oops, something went wrong". State
limits plainly instead of hiding them; there is no "coming soon" in this product.
