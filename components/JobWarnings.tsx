'use client';

import type { Severity, Warning } from '@/lib/registry/types';

interface JobWarningsProps {
  warnings: Warning[];
}

/**
 * What a finished conversion had to discard, in three tiers.
 *
 * The tiers are read off `warning.severity`, which the engine set at the point
 * of loss. Nothing here inspects the sentence: a component that decided
 * severity by looking for the word "dropped" would go wrong the first time
 * somebody rephrased a warning, and would go wrong quietly, in the direction
 * of saying less than happened.
 *
 * The design settles what each tier looks like, and it is not three shades of
 * grey:
 *
 * - **Lost** is the theme inverted — a dark block in light mode, a light one
 *   in dark — set larger than anything near it. It is the only element on the
 *   page that does that, so a row with something missing cannot be skimmed
 *   past.
 * - **Changed** is a rule down the left and body-coloured text. Present,
 *   quieter, no block.
 * - **Notes** are folded into a disclosure with a turning caret.
 *
 * A routed pair produces warnings from both of its steps, so five or six on
 * one row is ordinary. Grouping is what keeps that readable — the question a
 * person arrives with is "did I lose anything", and the answer should not be
 * somewhere in a list of six sentences that all look alike.
 */
export default function JobWarnings({ warnings }: JobWarningsProps) {
  if (warnings.length === 0) return null;

  const lost = warnings.filter((w) => w.severity === 'lost');
  const changed = warnings.filter((w) => w.severity === 'changed');
  const notes = warnings.filter((w) => w.severity === 'note');

  return (
    <div className="mt-4">
      {/* Never collapsed, and first. Something the reader had is not in the
          file they are about to download. */}
      {lost.length > 0 && (
        <div className="flex items-start gap-3.5 rounded-chip bg-label px-4 py-4">
          <span className="mt-0.5 shrink-0 text-surface">
            <SeverityMark severity="lost" size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-[15px]/[1] font-bold text-surface">Lost</p>
            <ul className="mt-1.5 space-y-2">
              {lost.map((warning) => (
                <li key={key(warning)} className="text-lost text-surface">
                  <Step warning={warning} tone="text-separator" />
                  {warning.message}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {changed.length > 0 && (
        <div className="mt-3.5 flex items-start gap-3.5 border-l-[3px] border-ink py-0.5 pl-4">
          <span className="mt-0.5 shrink-0 text-ink">
            <SeverityMark severity="changed" size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-[14.5px]/[1] font-semibold text-ink">Changed</p>
            <ul className="mt-1.5 space-y-1.5">
              {changed.map((warning) => (
                <li key={key(warning)} className="text-[16px]/[1.5] text-ink">
                  <Step warning={warning} tone="text-tertiary" />
                  {warning.message}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Notes are how the conversion works rather than what it cost, so they
          start closed. A native <details> is keyboard-operable and opens
          without JavaScript, which a hand-rolled disclosure would have to earn
          back. */}
      {notes.length > 0 && (
        <details className="mt-3.5 border-t border-separator pt-2.5">
          <summary className="flex min-h-8 items-center gap-2.5 text-[14.5px] font-medium text-secondary">
            <span className="recast-caret inline-block font-mono text-[10px]/[1]">▶</span>
            <SeverityMark severity="note" size={14} />
            {notes.length === 1 ? '1 note' : `${notes.length} notes`}
          </summary>
          <ul className="space-y-1.5 pt-2 pb-1 pl-[23px]">
            {notes.map((warning) => (
              <li key={key(warning)} className="text-[15px]/[1.55] text-secondary">
                <Step warning={warning} tone="text-tertiary" />
                {warning.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** A stable key, since two steps of a route can lose the same thing. */
function key(warning: Warning): string {
  return `${warning.step ?? ''}|${warning.message}`;
}

/**
 * Which converter produced it, when there was more than one.
 *
 * Set beside the sentence rather than baked into it, so the text stays the
 * text somebody wrote and the interface can still say which half lost what.
 */
function Step({ warning, tone }: { warning: Warning; tone: string }) {
  if (!warning.step) return null;
  return <span className={`font-mono text-[13px] ${tone}`}>{warning.step} </span>;
}

/**
 * The three marks, from the design: a filled notch, a half-filled square, an
 * empty one. They read as a sequence even in greyscale, so the tier does not
 * depend on colour alone.
 */
function SeverityMark({ severity, size }: { severity: Severity; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      {severity === 'lost' && <path d="M3.5 3.5h17v10h-7v7h-10z" fill="currentColor" />}
      {severity !== 'lost' && (
        <rect
          x="4.25"
          y="4.25"
          width="15.5"
          height="15.5"
          rx="2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        />
      )}
      {severity === 'changed' && (
        <path d="M4.25 4.25h15.5v7.75H4.25z" fill="currentColor" />
      )}
    </svg>
  );
}
