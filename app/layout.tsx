import type { Metadata, Viewport } from 'next';
import { Schibsted_Grotesk, Spline_Sans_Mono } from 'next/font/google';
import { THEME_COLOR } from '@/lib/theme';
import './globals.css';

/* next/font downloads these at build time and serves them from Recast's own
   origin. No request reaches a font CDN when someone opens the page — which is
   what makes "files never leave your browser" checkable rather than asserted,
   and what lets the page keep working with the network unplugged.

   The design file links Google's stylesheet because a design file has to; the
   product must not, and `pnpm verify:browser` fails on any off-origin request. */
const grotesk = Schibsted_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-grotesk',
  display: 'swap',
});

const splineMono = Spline_Sans_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-spline-mono',
  display: 'swap',
});

/**
 * Next applies `basePath` to everything under `_next/`, but not to a path given
 * in `metadata.icons` — that one has to be prefixed here or it 404s on a Pages
 * project site. Empty string in dev and on Vercel, so the path is unchanged.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  title: 'Recast — convert documents in your browser',
  description:
    'Convert between PDF, Word, OpenDocument, RTF, HTML, EPUB, Markdown, plain text, PowerPoint, Excel, CSV and JSON. Every conversion runs in your browser; files never leave your machine.',
  icons: {
    icon: [
      { url: `${basePath}/icon.svg`, type: 'image/svg+xml' },
      { url: `${basePath}/icon-32.png`, sizes: '32x32', type: 'image/png' },
      { url: `${basePath}/icon-16.png`, sizes: '16x16', type: 'image/png' },
    ],
    apple: `${basePath}/icon-180.png`,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEME_COLOR.light },
    { media: '(prefers-color-scheme: dark)', color: THEME_COLOR.dark },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${grotesk.variable} ${splineMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
