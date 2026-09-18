'use client';

import { useCallback, useState } from 'react';
import DropZone from '@/components/DropZone';
import JobList from '@/components/JobList';
import { detectFormat, settleArchive } from '@/lib/files/detect';
import { downloadResult, zipFiles } from '@/lib/files/download';
import { downloadBlob } from '@/lib/files/download';
import { detectArchive, enqueue } from '@/lib/jobs/runner';
import { useJobs } from '@/lib/jobs/store';
import { FORMATS, targetsFor } from '@/lib/registry';
import { MAX_BYTES } from '@/lib/registry/shared';

const FORMAT_LINE = FORMATS.map((f) => f.toUpperCase()).join(' · ');
const FORMAT_SENTENCE = 'It reads PDF, DOCX, PPTX, XLSX, CSV, MD, TXT and RTF.';

export default function Home() {
  const jobs = useJobs((state) => state.jobs);
  const addJob = useJobs((state) => state.addJob);
  const setTarget = useJobs((state) => state.setTarget);
  const [notices, setNotices] = useState<string[]>([]);

  const onFiles = useCallback(
    async (files: File[]) => {
      const problems: string[] = [];

      for (const file of files) {
        if (file.size === 0) {
          problems.push(`${file.name} is empty.`);
          continue;
        }
        if (file.size > MAX_BYTES) {
          problems.push(
            `${file.name} is ${Math.round(file.size / 1024 / 1024)} MB. Recast works in memory and stops at 100 MB.`,
          );
          continue;
        }

        // Reads the leading bytes rather than believing the extension. A ZIP
        // could be any of DOCX/XLSX/PPTX, and only the archive's content-type
        // map can say which — so that question goes to the worker, where the
        // zip library already lives.
        let detection = await detectFormat(file);
        let expandedSize: number | undefined;
        if (detection.needsArchiveCheck) {
          const archive = await detectArchive(file);
          expandedSize = archive.expanded;
          detection = settleArchive(detection.claimed, archive.format);
        }

        if (!detection.format) {
          problems.push(
            detection.reason ?? `Recast cannot read ${file.name}. ${FORMAT_SENTENCE}`,
          );
          continue;
        }

        const first = targetsFor(detection.format)[0];
        if (!first) {
          problems.push(
            `Recast can read ${file.name} but has nothing to turn it into yet.`,
          );
          continue;
        }

        addJob({
          file,
          from: detection.format,
          to: first,
          detectedAs: detection.mismatch ? detection.claimed : undefined,
          expandedSize,
        });
      }

      setNotices(problems);
    },
    [addJob],
  );

  const onDownload = useCallback(
    (id: string) => {
      const job = jobs.find((j) => j.id === id);
      if (!job?.result) return;
      const stem = job.file.name.replace(/\.[^.]+$/, '');
      void downloadResult(job.result.files, `${stem}.zip`);
    },
    [jobs],
  );

  const onDownloadAll = useCallback(() => {
    const files = jobs.flatMap((job) => job.result?.files ?? []);
    if (files.length === 0) return;
    if (files.length === 1) {
      downloadBlob(files[0]!.blob, files[0]!.filename);
      return;
    }
    void zipFiles(files).then((blob) => downloadBlob(blob, 'recast.zip'));
  }, [jobs]);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-separator bg-canvas-blur backdrop-blur-[20px]">
        <div className="mx-auto flex max-w-3xl items-baseline justify-between gap-4 px-5 py-4">
          <span className="text-heading tracking-[-0.01em] text-label">Recast</span>
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

        {notices.length > 0 && (
          <ul role="status" className="mt-4 max-w-prose space-y-1">
            {notices.map((notice) => (
              <li key={notice} className="text-body text-secondary">
                {notice}
              </li>
            ))}
          </ul>
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
