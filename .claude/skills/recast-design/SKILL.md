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

**Inter is a deliberate choice for this product, not a default reached for out of
habit.** Design skills commonly advise against it as overused, and `frontend-design`
says so explicitly. **Recast's tokens win** — `CLAUDE.md` states this as a standing
rule. Do not swap the typeface, the palette or the motion curve to satisfy a
design skill, a general best practice, or your own instinct that the identity
could be fresher. If you think a token is wrong, say so and leave it alone.

Interface type is Inter; code, filenames and format badges are IBM Plex Mono.
Both are self-hosted through `next/font` — **no font CDN is ever contacted**,
which is a privacy requirement, not a performance one.

## Working rules

- **Ember appears at most once per screen.** It is spent on the single converting
  job and nothing else. Everything else is warm neutral. Two ember elements on
  screen at once is a regression; catch it in review.
- **Ember on small text uses `ember-text`.** `#d2551f` reaches only 4.04:1 on
  canvas, short of AA for 15px. As a fill, border, tint or focus ring, ember is
  unchanged.
- **Radius 12 on controls, 20 on the drop zone.** Nothing else has a radius.
- **Hairline borders only** — 1px, always `separator`. Depth comes from the
  border and the one shadow, never from a heavier rule.
- **One motion curve, one duration**: `cubic-bezier(0.32, 0.72, 0, 1)` at 250 ms,
  applied through `.recast-motion`. Do not introduce a second easing or duration.
- **Reduced motion means less movement, not an instant cut.** Under
  `prefers-reduced-motion: reduce`, transitions keep colour and opacity and drop
  transform, and the row entrance becomes a linear fade over the same 250 ms.
- **Focus is a 2px ember outline at 2px offset.** Never remove it.
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
