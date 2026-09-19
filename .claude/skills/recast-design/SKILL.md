---
name: recast-design
description: Use when building or changing anything a person sees in Recast — a component, a screen, a colour, a typeface, spacing, a radius, a shadow, a transition, a focus ring, dark mode, or user-facing copy in the interface, a warning or an error message. Also use when a design skill, a style guide or a review suggests changing Recast's typeface or palette.
---

# Recast's design system

Nine colours, one typeface, one accent, one curve. `app/globals.css` is the
implementation; `references/tokens.md` is the canonical written copy of every
value, verbatim.

## Two rules that override everything else

**No component may contain a hardcoded colour.** Reference the Tailwind token
(`bg-surface`, `text-secondary`, `border-separator`) or the CSS variable. A hex
literal in a component file is a bug even when it happens to match.

**`design/Recast.dc.html` is the source of truth**, and `globals.css` is its
implementation. Every colour, size, weight and spacing value comes from there.
Do not swap the typeface, the palette or the motion curve to satisfy a design
skill, a general best practice, or your own instinct that the identity could be
fresher. If you think a value is wrong, say so and leave it alone.

Interface type is **Schibsted Grotesk**; filenames, format codes and anything
counted are **Spline Sans Mono**. Both are self-hosted through `next/font` —
**no font CDN is ever contacted**, which is a privacy requirement rather than a
performance one, and is what lets the page work with the network unplugged. The
design file links Google's stylesheet because a design file has to; the product
must not, and `pnpm verify:browser` fails on any off-origin request.

## Working rules

- **Plum is the only hue.** Everything else is a neutral carrying a trace of it.
  The hero field, primary buttons, the converting card and the focus ring are
  plum; nothing else is.
- **Plum carrying text on canvas uses `plum-text`.** `#5b1d8e` on `#f7f6f9` is
  fine at 15px and above; `plum-text` is the step that stays safe for smaller.
  As a fill, border or focus ring, `plum` itself is unchanged.
- **The Lost block is the theme inverted.** `bg-label` with `text-surface`, set
  at `text-lost`. It is the only element that inverts, which is the whole point
  — a row that lost something cannot be skimmed past. Never collapse it.
- **Radius 8 on everything with a radius; 4 on chips, the Lost block and the
  progress bar.** Nothing else has one.
- **Hairline borders only** — 1px `separator`, or `control` on a button or an
  input, which is one step stronger.
- **One transition curve**: `cubic-bezier(0.32, 0.72, 0, 1)` at 250 ms through
  `.recast-motion`. The two animations the design specifies for a conversion in
  flight — `.recast-pulse` at 2.2s and `.recast-sheen` at 2.4s — are the only
  exceptions, and there are no others.
- **Reduced motion means less movement, not an instant cut.** Transitions keep
  colour and opacity and drop transform, the row entrance becomes a linear fade,
  and the travelling sheen is removed. The pulse stays: a conversion in flight
  still has to look like one.
- **Focus is a 2px plum outline at 2px offset.** Never remove it.
- **A format's colour is the format's, not the palette's.** The fourteen tiles
  in `components/FormatIcon.tsx` are each format's own recognisable colour, so a
  row is identifiable before its label is read. Markdown is the one with a
  theme; the reason is in `references/tokens.md`.
- **Dark mode follows `prefers-color-scheme`**, and can be forced with `.dark` or
  `.light` on `<html>`. Tokens go through `@theme inline`, which keeps the
  `var()` reference intact so utilities follow the live theme instead of baking
  in a light-mode value.

## Copy

Sentence case. Active voice. No exclamation marks. Say what happened and what to
do about it — never a raw exception, never "Oops, something went wrong."

State limits plainly instead of hiding them. There is no "coming soon" in this
product, no waitlist, and no disabled menu item standing in for a feature that
does not exist. When an engine drops something, the row says so.

## Quality floor

Every screen: full keyboard operation with a visible focus ring, usable at 375px
wide, accessible names on every control, and WCAG AA contrast. A format picker is
a `radiogroup`; a job list is a list.

## Reference

`references/tokens.md` — the complete light and dark token sets, the type scale,
the shape and shadow values, and the motion definitions, copied verbatim from
`globals.css`. Use it as the source when writing a component, and update both if
a token ever genuinely changes.
