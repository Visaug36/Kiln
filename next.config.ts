import type { NextConfig } from 'next';
import withBundleAnalyzer from '@next/bundle-analyzer';

/**
 * GitHub Pages serves a project site from `/<repo>`, so the Pages workflow sets
 * NEXT_PUBLIC_BASE_PATH. It is empty everywhere else: `pnpm dev` and a Vercel
 * deploy both serve Recast from the root.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/**
 * Recast is a fully static export. There is no server runtime, no route
 * handler and no middleware — the promise that files never leave the
 * browser is only credible if there is nothing on the other end to
 * receive them.
 */
const nextConfig: NextConfig = {
  output: 'export',
  basePath,
  /**
   * Writes `matrix/index.html` rather than `matrix.html`.
   *
   * Without it the export puts the page at `matrix.html` *and* a directory at
   * `matrix/` holding only RSC payloads — so whether `/matrix` resolves is up
   * to how a particular host breaks that tie. GitHub Pages happens to guess
   * well; a host that looks for `matrix/index.html` and stops serves a 404 on
   * a link the site itself prints. This repo has shipped a green deploy over a
   * broken site once already, so the ambiguity is removed rather than relied
   * on. `pnpm verify:browser` caught it the first time it ran.
   */
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
};

export default withBundleAnalyzer({ enabled: process.env.ANALYZE === 'true' })(
  nextConfig,
);
