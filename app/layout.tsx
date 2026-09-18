import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Inter } from 'next/font/google';
import { THEME_COLOR } from '@/lib/theme';
import './globals.css';

/* next/font downloads these at build time and serves them from Recast's own
   origin. No request reaches a font CDN when someone opens the page. */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
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
  icons: { icon: `${basePath}/icon.svg` },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEME_COLOR.light },
    { media: '(prefers-color-scheme: dark)', color: THEME_COLOR.dark },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
