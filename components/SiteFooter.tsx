import Link from 'next/link';
import { ISSUES_URL, REPO_URL } from '@/lib/site';

/**
 * Four links, all of which lead somewhere.
 *
 * The design's footer also has a language switcher and a version number. The
 * switcher is cut for the same reason as the header's; the version is cut
 * because Recast does not have one to state, and inventing `v1.4.2` to fill
 * the space is the sort of small untruth this interface is supposed to avoid.
 */
export default function SiteFooter() {
  const link = 'recast-motion py-3 text-[14.5px]/[20px] text-ink hover:text-label';

  return (
    <footer className="mt-4 border-t border-separator bg-surface">
      <nav
        aria-label="About Recast"
        className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-4 sm:px-10"
      >
        <Link href="/#formats" className={link}>
          Formats
        </Link>
        <Link href="/matrix" className={link}>
          The full matrix
        </Link>
        <a href={REPO_URL} className={link}>
          Source code
        </a>
        <a href={ISSUES_URL} className={link}>
          Report a problem
        </a>
      </nav>
    </footer>
  );
}
