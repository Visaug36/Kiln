'use client';

import { useCallback, useState } from 'react';
import DropZone from '@/components/DropZone';
import JobList from '@/components/JobList';
import { detectFormat } from '@/lib/files/detect';
import { downloadAll, downloadBlob } from '@/lib/files/download';
import { enqueue } from '@/lib/jobs/runner';
import { useJobs } from '@/lib/jobs/store';
import { FORMATS, targetsFor } from '@/lib/registry';

const FORMAT_LINE = FORMATS.map((f) => f.toUpperCase()).join(' · ');
const FORMAT_SENTENCE = 'It reads PDF, DOCX, MD, TXT and RTF.';

export default function Home() {
  const jobs = useJobs((state) => state.jobs);
  const addJob = useJobs((state) => state.addJob);
  const setTarget = useJobs((state) => state.setTarget);
  const [notice, setNotice] = useState<string | null>(null);

  const onFiles = useCallback(
    (files: File[]) => {
      const rejected: string[] = [];

      for (const file of files) {
        const from = detectFormat(file.name);
        const first = from ? targetsFor(from)[0] : undefined;
        if (!from || !first) {
          rejected.push(file.name);
          continue;
        }
        addJob(file, from, first);
      }

      if (rejected.length === 0) {
        setNotice(null);
      } else if (rejected.length === 1) {
        setNotice(`Kiln cannot read ${rejected[0]}. ${FORMAT_SENTENCE}`);
      } else {
        setNotice(
          `Kiln cannot read ${rejected.length} of those files. ${FORMAT_SENTENCE}`,
        );
      }
    },
    [addJob],
  );

  const onDownload = useCallback(
    (id: string) => {
      const job = jobs.find((j) => j.id === id);
      if (job?.result) downloadBlob(job.result.blob, job.result.filename);
    },
    [jobs],
  );

  const onDownloadAll = useCallback(() => {
    void downloadAll(jobs.flatMap((job) => (job.result ? [job.result] : [])));
  }, [jobs]);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-separator bg-canvas-blur backdrop-blur-[20px]">
        <div className="mx-auto flex max-w-3xl items-baseline justify-between gap-4 px-5 py-4">
          <span className="text-heading tracking-[-0.01em] text-label">Kiln</span>
          <p className="text-body text-secondary">Files never leave your browser</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 pt-16 pb-24 sm:pt-24">
        <h1 className="text-hero text-label">Drop a document</h1>
        <p className="mt-3 font-mono text-[13px] leading-5 text-secondary">
          {FORMAT_LINE}
        </p>

        <div className="mt-8">
          <DropZone onFiles={onFiles}>
            <span className="text-body text-secondary">
              Drop it anywhere on this page, or click to choose a file
            </span>
          </DropZone>
        </div>

        {notice && (
          <p role="status" className="mt-4 max-w-prose text-body text-secondary">
            {notice}
          </p>
        )}

        <JobList
          jobs={jobs}
          onTarget={setTarget}
          onStart={enqueue}
          onDownload={onDownload}
          onDownloadAll={onDownloadAll}
        />
      </main>
    </div>
  );
}
