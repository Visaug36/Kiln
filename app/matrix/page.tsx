import type { Metadata } from 'next';
import Link from 'next/link';
import FormatIcon from '@/components/FormatIcon';
import SiteFooter from '@/components/SiteFooter';
import SiteHeader from '@/components/SiteHeader';
import { FORMATS, FORMAT_LABEL } from '@/lib/registry';
import { matrix, totals } from '@/lib/registry/matrix';
import { unsupported } from '@/lib/registry/unsupported';
import type { Cell } from '@/lib/registry/matrix';

export const metadata: Metadata = {
  title: 'The full matrix — Recast',
  description:
    'Every pair Recast converts, every pair it refuses, and the reason for each refusal.',
};

/**
 * The support matrix, in full.
 *
 * Not a client component: it has no state and no interaction, so it is
 * rendered once at build time and ships no JavaScript of its own.
 *
 * Every number and every cell comes from the registry. There is no list here
 * to keep in step — declaring one edge in `table.ts` changes this page, the
 * format picker and the refusal notes together, which is the whole point of
 * the registry being the only source of truth.
 */
export default function MatrixPage() {
  const rows = matrix();
  const counts = totals();

  // One reason covers many pairs, so the refusals are grouped by the sentence
  // rather than listed 64 times.
  const reasons = new Map<string, string[]>();
  for (const pair of unsupported) {
    const list = reasons.get(pair.reason) ?? [];
    list.push(`.${pair.from} → .${pair.to}`);
    reasons.set(pair.reason, list);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-10 pb-16 sm:px-10">
        <h1 className="text-title text-label">The full matrix</h1>

        <p className="mt-3 max-w-[640px] text-[16px]/[1.6] text-secondary">
          {counts.formats} formats and {counts.pairs} pairs — {counts.direct} converted
          directly, {counts.routed} by passing through a hub format on the way.{' '}
          {counts.refused} more are refused on purpose, with the reason for each below.
          Every number on this page is counted from the registry rather than written down.
        </p>

        <div className="mt-8 overflow-x-auto">
          <table className="border-collapse text-[13px]">
            <caption className="sr-only">
              Source formats down the side, target formats across the top.
            </caption>
            <thead>
              <tr>
                <th scope="col" className="sr-only">
                  From
                </th>
                {FORMATS.map((to) => (
                  <th
                    key={to}
                    scope="col"
                    className="border-b border-separator px-2 py-2 text-left font-mono font-normal text-secondary"
                  >
                    .{to}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((cells, index) => (
                <tr key={FORMATS[index]}>
                  <th
                    scope="row"
                    className="border-b border-separator py-2 pr-4 text-left font-mono text-[13px] font-normal whitespace-nowrap text-label"
                  >
                    <span className="flex items-center gap-2">
                      <FormatIcon format={FORMATS[index]!} size={18} />.{FORMATS[index]}
                    </span>
                  </th>
                  {cells.map((cell) => (
                    <td
                      key={`${cell.from}-${cell.to}`}
                      className="border-b border-separator px-2 py-2 font-mono whitespace-nowrap"
                    >
                      <CellText cell={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mt-12 text-heading text-label">Why the rest are refused</h2>
        <p className="mt-2 max-w-[640px] text-small text-secondary">
          The constraint that makes Recast private is the same one that limits it, so
          these are written down rather than hidden. There is no waiting list.
        </p>

        <ul className="mt-6 space-y-6">
          {[...reasons].map(([reason, pairs]) => (
            <li key={reason}>
              <p className="max-w-[640px] text-small text-ink">{reason}</p>
              <p className="mt-1 font-mono text-[13px] leading-5 text-tertiary">
                {pairs.join(' · ')}
              </p>
            </li>
          ))}
        </ul>

        <p className="mt-12">
          <Link
            href="/"
            className="recast-motion inline-flex h-11 items-center rounded-control bg-plum px-5 text-[15px] font-semibold text-on-plum"
          >
            Convert a document
          </Link>
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}

/**
 * What one cell says.
 *
 * The refusal reason is not repeated in 64 cells — it is written once below the
 * table, where it can be read as a sentence rather than as a tooltip.
 */
function CellText({ cell }: { cell: Cell }) {
  if (cell.kind === 'self') {
    return (
      <span className="text-tertiary" aria-label="the same format">
        —
      </span>
    );
  }
  if (cell.kind === 'refused') {
    return <span className="text-tertiary">no</span>;
  }
  if (cell.kind === 'routed') {
    return (
      <span className="text-secondary" title={`via ${FORMAT_LABEL[cell.via!]}`}>
        via .{cell.via}
      </span>
    );
  }
  return <span className="font-medium text-plum-text">direct</span>;
}
