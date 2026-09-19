'use client';

import FormatIcon from '@/components/FormatIcon';
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
 * One document, one card.
 *
 * The converting card is the only plum-edged thing on the page at any moment,
 * so the eye lands on the job that is actually running. Everything finished
 * goes back to a plain surface card.
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
  const running = job.state === 'converting';

  const downloadLabel = files.length > 1 ? `Download ${files.length}` : 'Download';
  const downloadTitle =
    files.length > 1
      ? `Download ${files.length} files from ${job.file.name} as a zip`
      : `Download ${outputName}`;

  return (
    <li
      className={[
        'recast-row-enter rounded-control border px-4 py-4 sm:px-5',
        running
          ? 'border-plum-edge border-l-[3px] border-l-plum bg-plum-wash'
          : 'border-separator bg-surface',
      ].join(' ')}
    >
      <div className="flex flex-col gap-y-3 sm:flex-row sm:items-center sm:justify-between sm:gap-x-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <FormatIcon format={job.from} size={22} />
          <span className="min-w-0 font-mono text-[15px]/[1.3] font-medium wrap-anywhere text-label">
            {job.file.name}
          </span>
          <span className="shrink-0 text-secondary" aria-hidden="true">
            <ArrowMark />
          </span>
          <FormatIcon format={job.to} size={22} />
          <span className="shrink-0 font-mono text-[15px]/[1.3] font-medium text-label">
            .{job.to}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          {job.state === 'queued' && (
            <button
              type="button"
              onClick={onStart}
              aria-label={`Convert ${job.file.name} to .${job.to}`}
              className="recast-motion h-11 rounded-control bg-plum px-5 text-[15px] font-semibold text-on-plum"
            >
              Convert
            </button>
          )}

          {running && (
            <>
              {/* The visible text carries the page count; the live region
                  carries the phase without it. A polite region that fires on
                  every page of a long PDF is read out several hundred times. */}
              {job.progress && (
                <span
                  className="font-mono text-[15px]/[1] font-medium text-plum-text"
                  aria-hidden="true"
                >
                  {describeProgress(job.progress, job.to)}
                </span>
              )}
              <span className="recast-pulse text-[15px] font-semibold text-plum-text">
                Converting
              </span>
              <span className="sr-only" role="status">
                {announceProgress(job.progress, job.to)}
              </span>
            </>
          )}

          {job.state === 'done' && (
            <button
              type="button"
              onClick={onDownload}
              aria-label={downloadTitle}
              className="recast-motion h-11 rounded-control bg-plum px-5 text-[15px] font-semibold text-on-plum"
            >
              {downloadLabel}
            </button>
          )}

          {job.state === 'failed' && (
            <span className="text-[15px] font-semibold text-label">Failed</span>
          )}
        </div>
      </div>

      {running && <ProgressBar job={job} />}

      {/* The extension lied. Say which one Recast believed. */}
      {job.detectedAs && (
        <p className="mt-2 max-w-prose text-small text-secondary">
          This file is named{' '}
          <span className="font-mono text-[13px]">.{job.detectedAs}</span> but its
          contents are {job.from.toUpperCase()}. Recast went with the contents.
        </p>
      )}

      {job.state === 'queued' && targets.length > 0 && (
        <div className="mt-3">
          <FormatPicker
            value={job.to}
            options={targets}
            onChange={onTarget}
            label={`Convert ${job.file.name} to`}
          />
        </div>
      )}

      {job.state === 'queued' && caveats.length > 0 && (
        <ul className="mt-3 max-w-prose space-y-1">
          {caveats.map((caveat) => (
            <li key={caveat} className="text-small text-secondary">
              {caveat}
            </li>
          ))}
        </ul>
      )}

      {caution && (
        <p className="mt-3 max-w-prose text-small text-secondary">{caution.message}</p>
      )}

      {job.state === 'queued' && <UnsupportedNote from={job.from} />}

      {job.state === 'done' && <JobWarnings warnings={warnings} />}

      {job.state === 'failed' && job.error && (
        <p className="mt-2 max-w-prose text-small text-secondary">{job.error}</p>
      )}
    </li>
  );
}

/**
 * How far through, when the engine can say.
 *
 * Determinate where there is a count to be determinate about, and a travelling
 * highlight either way — a job that is slow and a job that has stopped look
 * identical without one.
 */
function ProgressBar({ job }: { job: Job }) {
  const { done, total } = job.progress ?? {};
  const known = typeof done === 'number' && typeof total === 'number' && total > 0;
  const percent = known ? Math.min(100, Math.round((done! / total!) * 100)) : 0;

  return (
    <div
      className="relative mt-4 h-1.5 overflow-hidden rounded-chip bg-plum-track"
      role="progressbar"
      aria-label={`Converting ${job.file.name}`}
      aria-valuemin={known ? 0 : undefined}
      aria-valuemax={known ? 100 : undefined}
      aria-valuenow={known ? percent : undefined}
    >
      <div
        className="recast-motion absolute inset-y-0 left-0 rounded-chip bg-plum"
        style={{ width: known ? `${percent}%` : '18%' }}
      />
      <div className="recast-sheen absolute inset-y-0 left-0 w-[14%] bg-on-plum opacity-50" />
    </div>
  );
}

function ArrowMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3.5 12h16M13.5 6l6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
