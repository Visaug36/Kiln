'use client';

import type { Warning } from '@/lib/registry/types';

interface JobWarningsProps {
  warnings: Warning[];
}

/**
 * What a finished conversion had to discard, in three tiers.
 *
 * The tiers are read off `warning.severity`, which the engine set at the point
 * of loss. Nothing here inspects the sentence: a component that decided
 * severity by looking for the word "dropped" would go wrong the first time
 * somebody rephrased a warning, and would go wrong quietly, in the direction of
 * saying less than happened.
 *
 * A routed pair produces warnings from both of its steps, so five or six on one
 * row is ordinary. Grouping is what keeps that readable — the question a person
 * arrives with is "did I lose anything", and the answer should not be somewhere
 * in a list of six sentences that all look alike.
 */
export default function JobWarnings({ warnings }: JobWarningsProps) {
  if (warnings.length === 0) return null;

  const lost = warnings.filter((w) => w.severity === 'lost');
  const changed = warnings.filter((w) => w.severity === 'changed');
  const notes = warnings.filter((w) => w.severity === 'note');

  return (
    <div className="mt-2 max-w-prose space-y-3">
      {/* Never collapsed, and first. Something the reader had is not in the
          file they are about to download. */}
      {lost.length > 0 && (
        <Group heading="What was lost">
          {lost.map((warning) => (
            <Line key={line(warning)} warning={warning} tone="label" />
          ))}
        </Group>
      )}

      {changed.length > 0 && (
        <Group heading="What changed">
          {changed.map((warning) => (
            <Line key={line(warning)} warning={warning} tone="secondary" />
          ))}
        </Group>
      )}

      {/* Notes are how the conversion works rather than what it cost, so they
          start closed. A native <details> is keyboard-operable and open-able
          without JavaScript, which a hand-rolled disclosure would have to earn
          back. */}
      {notes.length > 0 && (
        <details className="group">
          <summary className="recast-motion cursor-pointer text-body font-medium text-secondary hover:text-label">
            {notes.length === 1 ? '1 note' : `${notes.length} notes`}
          </summary>
          <ul className="mt-1 space-y-1">
            {notes.map((warning) => (
              <Line key={line(warning)} warning={warning} tone="secondary" />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** A stable key, since two steps of a route can lose the same thing. */
function line(warning: Warning): string {
  return `${warning.step ?? ''}|${warning.message}`;
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-body font-medium text-label">{heading}</p>
      <ul className="mt-1 space-y-1">{children}</ul>
    </div>
  );
}

/**
 * One warning, with the step that produced it when there was more than one.
 *
 * The step is a separate element rather than a prefix baked into the sentence,
 * so it can be set in the same mono face the format badges use and the sentence
 * stays the sentence somebody wrote.
 */
function Line({ warning, tone }: { warning: Warning; tone: 'label' | 'secondary' }) {
  return (
    <li className={`text-body ${tone === 'label' ? 'text-label' : 'text-secondary'}`}>
      {warning.step && (
        <span className="font-mono text-[13px] text-tertiary">{warning.step} </span>
      )}
      {warning.message}
    </li>
  );
}
