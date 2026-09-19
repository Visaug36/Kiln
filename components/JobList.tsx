'use client';

import JobRow from '@/components/JobRow';
import type { Job } from '@/lib/jobs/types';
import type { Format } from '@/lib/registry';

interface JobListProps {
  jobs: readonly Job[];
  onTarget: (id: string, to: Format) => void;
  onStart: (id: string) => void;
  onDownload: (id: string) => void;
  onDownloadAll: () => void;
}

/**
 * The list is the whole result surface. When it is empty the hero stands in for
 * it, so there is nothing to render here.
 */
export default function JobList({
  jobs,
  onTarget,
  onStart,
  onDownload,
  onDownloadAll,
}: JobListProps) {
  if (jobs.length === 0) return null;

  const completed = jobs.filter((job) => job.state === 'done');
  const fileCount = completed.reduce(
    (total, job) => total + (job.result?.files.length ?? 0),
    0,
  );

  return (
    <section aria-label="Conversions" className="mt-5">
      <ul className="flex flex-col gap-3.5">
        {jobs.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            onTarget={(to) => onTarget(job.id, to)}
            onStart={() => onStart(job.id)}
            onDownload={() => onDownload(job.id)}
          />
        ))}
      </ul>

      {completed.length >= 2 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-separator pt-4 text-body">
          <span className="text-secondary">
            {completed.length} documents
            {fileCount > completed.length && ` · ${fileCount} files`}
          </span>
          <button
            type="button"
            onClick={onDownloadAll}
            className="recast-motion h-11 rounded-control border border-control px-4 text-[15px] font-semibold text-label hover:border-plum"
          >
            Download all
          </button>
        </div>
      )}
    </section>
  );
}
