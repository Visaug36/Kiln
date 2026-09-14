'use client';

import FormatPicker from '@/components/FormatPicker';
import { baseName } from '@/lib/files/detect';
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
 * Ember is spent on the single firing job and nowhere else, so a screen full of
 * finished conversions stays warm neutral.
 */
export default function JobRow({ job, onTarget, onStart, onDownload }: JobRowProps) {
  const targets = targetsFor(job.from);
  const converter = find(job.from, job.to);
  const caveat =
    converter && converter.fidelity !== 'exact' ? converter.caveat : undefined;
  const outputName = job.result?.filename ?? `${baseName(job.file.name)}.${job.to}`;

  return (
    <li className="kiln-row-enter border-b border-separator py-4 last:border-b-0">
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
              className="kiln-motion font-medium text-label underline decoration-separator underline-offset-4 hover:decoration-label"
            >
              Convert
            </button>
          )}

          {job.state === 'firing' && (
            <span className="font-medium text-ember-text" role="status">
              Firing…
            </span>
          )}

          {job.state === 'done' && (
            <button
              type="button"
              onClick={onDownload}
              aria-label={`Download ${outputName}`}
              className="kiln-motion font-medium text-label underline decoration-separator underline-offset-4 hover:decoration-label"
            >
              Download
            </button>
          )}

          {job.state === 'failed' && (
            <span className="font-medium text-label">Failed</span>
          )}
        </span>
      </div>

      {job.state === 'queued' && targets.length > 0 && (
        <div className="mt-2 flex flex-wrap items-start gap-x-3 gap-y-1">
          <FormatPicker
            value={job.to}
            options={targets}
            onChange={onTarget}
            label={`Convert ${job.file.name} to`}
          />
        </div>
      )}

      {job.state === 'queued' && caveat && (
        <p className="mt-2 max-w-prose text-body text-secondary">{caveat}</p>
      )}

      {job.state === 'failed' && job.error && (
        <p className="mt-1 max-w-prose text-body text-secondary">{job.error}</p>
      )}
    </li>
  );
}
