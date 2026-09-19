'use client';

import FormatPicker from '@/components/FormatPicker';
import JobWarnings from '@/components/JobWarnings';
import UnsupportedNote from '@/components/UnsupportedNote';
import { announceProgress, describeProgress } from '@/lib/jobs/progress';
import { baseName } from '@/lib/files/detect';
import { sizeCaution } from '@/lib/files/capacity';
import type { Job } from '@/lib/jobs/types';
import { find, targetsFor, type Format } from '@/lib/registry';

interface JobRowProps {
  job: Job;
  onTarget: (to: Format) => void;
  onStart: () => void;
  onDownload: () => void;
}

/**
 * One document, one line. No card, no file-type icon — the format badge and the
 * filename already say everything a row needs to say.
 *
 * Ember is spent on the single converting job and nowhere else, so a screen full
 * of finished conversions stays warm neutral.
 */
export default function JobRow({ job, onTarget, onStart, onDownload }: JobRowProps) {
  const targets = targetsFor(job.from);
  // A route is one converter or two, and every step's caveat comes with it —
  // converting through an intermediate format should show both reasons, not
  // whichever one happened to be first.
  const caveats = find(job.from, job.to)?.caveats ?? [];

  // Worked out before the conversion starts, not after it fails. On iOS a tab
  // that runs out of memory is killed outright, so there is no "after".
  const caution =
    job.state === 'queued'
      ? sizeCaution(job.file, job.from, job.to, { expandedSize: job.expandedSize })
      : undefined;

  const files = job.result?.files ?? [];
  const warnings = job.result?.warnings ?? [];
  const outputName = files[0]?.filename ?? `${baseName(job.file.name)}.${job.to}`;

  const downloadLabel = files.length > 1 ? `Download ${files.length}` : 'Download';
  const downloadTitle =
    files.length > 1
      ? `Download ${files.length} files from ${job.file.name} as a zip`
      : `Download ${outputName}`;

  return (
    <li className="recast-row-enter border-b border-separator py-4 last:border-b-0">
      <div className="flex flex-col gap-y-1 sm:flex-row sm:items-baseline sm:gap-x-3">
        <div className="flex min-w-0 items-baseline gap-x-3">
          <span
            className="shrink-0 rounded-control bg-fill px-2 py-0.5 font-mono text-[13px] leading-5 text-secondary"
            aria-hidden="true"
          >
            {job.from}
          </span>

          <span className="min-w-0 font-mono text-[13px] leading-5 wrap-anywhere text-label">
            {job.file.name}
            <span className="text-secondary"> → </span>
            <span>.{job.to}</span>
          </span>
        </div>

        <span className="shrink-0 text-body sm:ml-auto">
          {job.state === 'queued' && (
            <button
              type="button"
              onClick={onStart}
              aria-label={`Convert ${job.file.name} to .${job.to}`}
              className="recast-motion font-medium text-label underline decoration-separator underline-offset-4 hover:decoration-label"
            >
              Convert
            </button>
          )}

          {job.state === 'converting' && (
            // The visible text carries the page count; the live region carries
            // the phase without it. A polite region that fires on every page of
            // a long PDF is read out several hundred times.
            <span className="font-medium text-ember-text" role="status">
              <span aria-hidden="true">{describeProgress(job.progress, job.to)}</span>
              <span className="sr-only">{announceProgress(job.progress, job.to)}</span>
            </span>
          )}

          {job.state === 'done' && (
            <button
              type="button"
              onClick={onDownload}
              aria-label={downloadTitle}
              className="recast-motion font-medium text-label underline decoration-separator underline-offset-4 hover:decoration-label"
            >
              {downloadLabel}
            </button>
          )}

          {job.state === 'failed' && (
            <span className="font-medium text-label">Failed</span>
          )}
        </span>
      </div>

      {/* The extension lied. Say which one Recast believed. */}
      {job.detectedAs && (
        <p className="mt-1 max-w-prose text-body text-secondary">
          This file is named{' '}
          <span className="font-mono text-[13px]">.{job.detectedAs}</span> but its
          contents are {job.from.toUpperCase()}. Recast went with the contents.
        </p>
      )}

      {job.state === 'queued' && targets.length > 0 && (
        <div className="mt-2">
          <FormatPicker
            value={job.to}
            options={targets}
            onChange={onTarget}
            label={`Convert ${job.file.name} to`}
          />
        </div>
      )}

      {job.state === 'queued' && caveats.length > 0 && (
        <ul className="mt-2 max-w-prose space-y-1">
          {caveats.map((caveat) => (
            <li key={caveat} className="text-body text-secondary">
              {caveat}
            </li>
          ))}
        </ul>
      )}

      {caution && (
        <p className="mt-2 max-w-prose text-body text-secondary">{caution.message}</p>
      )}

      {job.state === 'queued' && <UnsupportedNote from={job.from} />}

      {job.state === 'done' && <JobWarnings warnings={warnings} />}

      {job.state === 'failed' && job.error && (
        <p className="mt-1 max-w-prose text-body text-secondary">{job.error}</p>
      )}
    </li>
  );
}
