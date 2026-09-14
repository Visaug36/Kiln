import type { NextConfig } from 'next';

/**
 * GitHub Pages serves a project site from `/<repo>`, so the Pages workflow sets
 * NEXT_PUBLIC_BASE_PATH. It is empty everywhere else: `pnpm dev` and a Vercel
 * deploy both serve Kiln from the root.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/**
 * Kiln is a fully static export. There is no server runtime, no route
 * handler and no middleware — the promise that files never leave the
 * browser is only credible if there is nothing on the other end to
 * receive them.
 */
const nextConfig: NextConfig = {
  output: 'export',
  basePath,
  reactStrictMode: true,
  images: { unoptimized: true },
};

export default nextConfig;
