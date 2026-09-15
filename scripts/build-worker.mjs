/**
 * Bundles the conversion worker into public/kiln-worker/.
 *
 * Next's bundler does not compile `new Worker(new URL('./x.ts', import.meta.url))`
 * for the client build: it copies the TypeScript source into the output as a
 * static asset. The deployed page would then fetch raw TypeScript, be handed a
 * non-JavaScript MIME type by the host, and fail every conversion — while the
 * dev server, the tests and the build all stayed green. So the worker is built
 * here, explicitly, and referenced by a stable URL.
 *
 * `splitting: true` keeps the engines in separate chunks that are only fetched
 * when a pair actually needs them, which is the same promise the registry's
 * `load()` makes.
 */
import { build } from 'esbuild';
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outdir = join(root, 'public', 'kiln-worker');

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const result = await build({
  entryPoints: [join(root, 'lib/workers/convert.worker.ts')],
  outdir,
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  metafile: true,
  // Mirrors the "@/*" path alias from tsconfig.json.
  alias: { '@': root },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  // pptxgenjs reaches for these on Node; in a browser it never takes that path.
  external: ['node:https', 'node:http', 'node:fs', 'fs', 'https', 'http'],
  loader: { '.png': 'dataurl' },
});

// pdfjs needs its own worker file beside the bundle, so `_pdfread` can resolve
// it relative to its own chunk without knowing anything about the deploy path.
cpSync(
  join(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
  join(outdir, 'pdf.worker.mjs'),
);

const files = readdirSync(outdir)
  .map((name) => ({ name, size: statSync(join(outdir, name)).size }))
  .sort((a, b) => b.size - a.size);

const total = files.reduce((sum, f) => sum + f.size, 0);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

console.log(`Worker bundle → public/kiln-worker/ (${files.length} files, ${kb(total)})`);
for (const file of files.slice(0, 8)) {
  console.log(`  ${kb(file.size).padStart(8)}  ${file.name}`);
}
if (files.length > 8) console.log(`  … and ${files.length - 8} more chunks`);

const entry = files.find((f) => f.name === 'convert.worker.js');
if (!entry) {
  console.error('convert.worker.js was not produced.');
  process.exit(1);
}
if (result.errors.length > 0) process.exit(1);
