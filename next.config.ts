import type { NextConfig } from 'next';

/**
 * Kiln is a fully static export. There is no server runtime, no route
 * handler and no middleware — the promise that files never leave the
 * browser is only credible if there is nothing on the other end to
 * receive them.
 */
const nextConfig: NextConfig = {
  output: 'export',
  reactStrictMode: true,
  images: { unoptimized: true },
};

export default nextConfig;
