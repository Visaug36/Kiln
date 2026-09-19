import Link from 'next/link';
import StaffMark from '@/components/StaffMark';
import { REPO_URL } from '@/lib/site';

/**
 * The same header on both pages.
 *
 * The design's header also carries a language switcher and a "Conversion
 * guide" item. Neither is here: five languages that do nothing is a worse
 * interface than one language honestly, and there is no guide to link to. What
 * somebody clicking either would actually want is the matrix, which exists.
 */
export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-separator bg-canvas-blur backdrop-blur-[20px]">
      <div className="mx-auto flex h-[68px] max-w-6xl items-center gap-5 px-4 sm:gap-7 sm:px-10">
        <Link href="/" className="flex items-center gap-2.5 py-3">
          <StaffMark size={28} />
          <span className="text-wordmark text-label">Recast</span>
        </Link>

        <nav className="flex items-center gap-5 sm:gap-6" aria-label="Sections">
          <Link
            href="/#formats"
            className="recast-motion py-3 text-[15px]/[20px] font-medium text-ink hover:text-label"
          >
            Formats
          </Link>
          <Link
            href="/matrix"
            className="recast-motion py-3 text-[15px]/[20px] font-medium text-ink hover:text-label"
          >
            Matrix
          </Link>
          <Link
            href="/#about"
            className="recast-motion hidden py-3 text-[15px]/[20px] font-medium text-ink hover:text-label sm:block"
          >
            About
          </Link>
        </nav>

        <a
          href={REPO_URL}
          className="recast-motion ml-auto flex h-11 shrink-0 items-center rounded-control border border-control px-3.5 text-[14.5px] font-semibold text-label hover:border-plum"
        >
          Source
        </a>
      </div>
    </header>
  );
}
