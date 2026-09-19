'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import DropZone from '@/components/DropZone';
import FormatIcon from '@/components/FormatIcon';
import JobList from '@/components/JobList';
import OffOriginCount from '@/components/OffOriginCount';
import SiteFooter from '@/components/SiteFooter';
import SiteHeader from '@/components/SiteHeader';
import StaffMark from '@/components/StaffMark';
import { REPO_URL } from '@/lib/site';
import { detectFormat, settleArchive } from '@/lib/files/detect';
import { downloadResult, zipFiles } from '@/lib/files/download';
import { downloadBlob } from '@/lib/files/download';
import { detectArchive, enqueue } from '@/lib/jobs/runner';
import { useJobs } from '@/lib/jobs/store';
import { FORMATS, FORMAT_DESCRIPTION, targetsFor } from '@/lib/registry';
import { totals } from '@/lib/registry/matrix';
import { MAX_BYTES } from '@/lib/registry/shared';

const FORMAT_LINE = FORMATS.map((f) => `.${f}`).join(' ');

/**
 * What Recast can read, listed from the registry.
 *
 * This sentence used to name eight formats, hand-written, while the registry
 * declared fourteen — so somebody whose `.odt` failed detection was told Recast
 * could not read ODT, which it can. A component naming a format is the one
 * thing `CLAUDE.md` says never to do, and this was the last place doing it.
 */
function readableFormats(): string {
  const names = FORMATS.map((f) => `.${f}`);
  return `It reads ${names.slice(0, -1).join(', ')} and ${names.at(-1)}.`;
}

export default function Home() {
  const jobs = useJobs((state) => state.jobs);
  const addJob = useJobs((state) => state.addJob);
  const setTarget = useJobs((state) => state.setTarget);
  const [notices, setNotices] = useState<string[]>([]);
  const counts = totals();

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
            detection.reason ?? `Recast cannot read ${file.name}. ${readableFormats()}`,
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
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* The plum field. Everything above the fold sits on it, so the first
            thing seen is the one thing that distinguishes this converter. */}
        <section className="bg-plum px-4 py-8 sm:px-10 sm:py-12">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_540px] lg:items-start lg:gap-11">
            <div className="min-w-0">
              {/* The design sets the hero at 30px on a 390 phone and 44 on a
                  1280 desktop; 44px across four lines is a wall. */}
              <h1 className="max-w-[540px] text-[30px]/[1.12] font-extrabold tracking-[-0.025em] text-on-plum sm:text-hero">
                Convert documents without uploading them.
              </h1>
              <p className="mt-4 max-w-[500px] text-lead text-on-plum-soft">
                Recast turns a PDF into a Word file, a spreadsheet into JSON, an EPUB into
                Markdown — and does the whole job inside this browser tab. The file never
                reaches a server, because there isn’t one.
              </p>

              <ul className="mt-6 flex flex-wrap gap-2.5">
                {['Nothing is uploaded', 'No account', 'No analytics, no cookies'].map(
                  (claim) => (
                    <li
                      key={claim}
                      className="flex h-[38px] items-center gap-2 rounded-chip bg-plum-deep px-3.5 text-[14.5px] font-medium text-on-plum"
                    >
                      <CheckMark />
                      {claim}
                    </li>
                  ),
                )}
              </ul>

              <OffOriginCount />
            </div>

            <div className="rounded-control bg-surface p-4 sm:p-5">
              <DropZone onFiles={onFiles}>
                <DropArrow />
                <span className="mt-3 block text-[20px]/[1.3] font-bold text-label">
                  Drop a document here
                </span>
                <span className="mt-1.5 block text-[14.5px]/[1.5] text-secondary">
                  Anywhere on the page works — the whole window is a drop target.
                </span>
                <span className="mt-4 inline-flex h-[46px] items-center justify-center rounded-control bg-plum px-5 text-[15.5px] font-semibold text-on-plum">
                  Choose a file
                </span>
                <span className="mt-3 block font-mono text-[13px]/[1.5] break-words text-secondary">
                  {FORMAT_LINE}
                </span>
              </DropZone>

              {notices.length > 0 && (
                <ul role="status" className="mt-4 space-y-1">
                  {notices.map((notice) => (
                    <li key={notice} className="text-small text-secondary">
                      {notice}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        {jobs.length > 0 && (
          <section className="mx-auto max-w-6xl px-4 pt-8 sm:px-10">
            <h2 className="text-section text-label">
              {jobs.length === 1 ? 'One document' : `${jobs.length} documents`} in this
              tab
            </h2>
            <p className="mt-1.5 max-w-prose text-body text-secondary">
              Nothing here has been uploaded. Closing the tab discards the queue —
              download what you need first.
            </p>

            <JobList
              jobs={jobs}
              onTarget={setTarget}
              onStart={enqueue}
              onDownload={onDownload}
              onDownloadAll={onDownloadAll}
            />
          </section>
        )}

        <section id="formats" className="mx-auto max-w-6xl px-4 pt-11 sm:px-10">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
            <div>
              <h2 className="text-title text-label">
                Fourteen formats, {counts.pairs} conversion pairs
              </h2>
              <p className="mt-2 max-w-[620px] text-[16px]/[1.6] text-secondary">
                Every pair is a real converter, not a re-upload. Pick any two and Recast
                will tell you exactly what survives the trip.
              </p>
            </div>
            <Link
              href="/matrix"
              className="recast-motion flex items-center gap-2 py-3 text-[15px]/[20px] font-semibold text-plum-text"
            >
              See the full matrix
              <RightArrow />
            </Link>
          </div>

          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {FORMATS.map((format) => (
              <li
                key={format}
                className="rounded-control border border-separator bg-surface p-3.5"
              >
                <FormatIcon format={format} size={30} />
                <p className="mt-3 font-mono text-[15px]/[1] font-semibold text-label">
                  {format}
                </p>
                <p className="mt-1.5 text-[13px]/[1.35] text-secondary">
                  {FORMAT_DESCRIPTION[format]}
                </p>
                <p className="mt-2 font-mono text-[12.5px]/[1] text-plum-text">
                  {targetsFor(format).length} targets
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto max-w-6xl px-4 pt-9 sm:px-10">
          <ul className="flex flex-col gap-5 rounded-control border border-separator bg-surface px-5 py-5 sm:flex-row sm:gap-10">
            <Claim icon={<DropArrow small />} title="The converter comes to you.">
              The engine downloads once and runs on your machine. Open the network tab and
              drop a file — nothing leaves.
            </Claim>
            <Claim icon={<LostMark />} title="It tells you what it broke.">
              Formats disagree, so something always gives. Recast separates what was lost
              from what merely changed.
            </Claim>
            <Claim icon={<CheckMark plum />} title="It keeps working offline.">
              Once this page has loaded, conversions run with the network unplugged. The
              one exception is a Chinese or Japanese font, fetched from this site the
              first time a document needs one.
            </Claim>
          </ul>
        </section>

        <section id="about" className="mx-auto max-w-6xl px-4 py-10 sm:px-10">
          <div className="flex max-w-[760px] gap-4">
            <span className="mt-0.5 shrink-0">
              <StaffMark size={30} />
            </span>
            <div>
              <h2 className="text-heading text-label">About</h2>
              <p className="mt-2 text-prose text-ink">
                Recast converts documents in your browser. There is no server, no upload
                and no account — it is a static bundle, and once the page has loaded there
                is nothing on the other end to receive a file.
              </p>
              <p className="mt-2.5 text-prose text-ink">
                That is also what limits it. A conversion whose value is its visual layout
                needs a rendering engine too large to ship, so Recast refuses it rather
                than faking it, and{' '}
                <Link
                  href="/matrix"
                  className="recast-motion font-medium text-plum-text underline decoration-plum-edge underline-offset-4 hover:decoration-plum-text"
                >
                  the full matrix
                </Link>{' '}
                says which pairs those are and why.
              </p>
              <a
                href={REPO_URL}
                className="recast-motion mt-3 inline-block border-b border-plum-edge pb-1 font-mono text-[15px]/[1] font-medium text-plum-text"
              >
                github.com/Visaug36/Recast
              </a>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function Claim({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex flex-1 gap-3">
      <span className="mt-0.5 shrink-0 text-plum">{icon}</span>
      <p className="text-small text-ink">
        <b className="font-semibold text-label">{title}</b> {children}
      </p>
    </li>
  );
}

/* ---------------------------------------------------------------------------
   The interface's own marks, inline for the same reason the format tiles are:
   a page that makes no requests should not make one for a chevron.
   --------------------------------------------------------------------------- */

function CheckMark({ plum = false }: { plum?: boolean }) {
  return (
    <svg
      width={plum ? 18 : 15}
      height={plum ? 18 : 15}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="m4 12.5 5.5 5.5L20 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DropArrow({ small = false }: { small?: boolean }) {
  const size = small ? 18 : 34;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={small ? 'shrink-0' : 'mx-auto block text-plum'}
    >
      <g fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
        <path d="M12 2.5v11" />
        <path d="M7.5 9.5 12 14l4.5-4.5" strokeLinejoin="round" />
        <path d="M3.5 15.5v4a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-4" />
      </g>
    </svg>
  );
}

function RightArrow() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
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

function LostMark() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M3.5 3.5h17v10h-7v7h-10z" fill="currentColor" />
    </svg>
  );
}
