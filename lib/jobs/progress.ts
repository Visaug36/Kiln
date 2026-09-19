import type { Format, Progress } from '@/lib/registry/types';

/**
 * Turns what the worker reported into the line under a converting row.
 *
 * The words live here rather than in the engines: an engine reports a phase and
 * a count, and every sentence a person reads is written in one place, which is
 * what `interface-copy` asks for. It also means a future progress bar can read
 * the same numbers without any engine being touched again.
 */
export function describeProgress(progress: Progress | undefined, to: Format): string {
  // Empty rather than "Converting…", because the row already says that beside
  // this: the design puts the state word and the detail side by side, so a
  // fallback that repeats the word produced "Converting… Converting".
  if (!progress) return '';

  const step =
    progress.step && progress.steps && progress.steps > 1
      ? `Step ${progress.step} of ${progress.steps} · `
      : '';

  return `${step}${describePhase(progress, to)}`;
}

function describePhase(progress: Progress, to: Format): string {
  if (progress.phase === 'writing') return `Writing the .${to}`;

  const { unit, done, total } = progress;
  if (!unit || !done || !total) return 'Reading the file';

  return `Reading ${unit} ${done} of ${total}`;
}

/**
 * The same state with the counter taken out.
 *
 * A screen reader announcing "reading page 41 of 500" four hundred times is
 * worse than silence. The visible text carries the count; the live region
 * carries this, which changes twice in an ordinary conversion.
 */
export function announceProgress(progress: Progress | undefined, to: Format): string {
  if (!progress) return 'Converting';
  return progress.phase === 'writing' ? `Writing the .${to}` : 'Reading the file';
}
