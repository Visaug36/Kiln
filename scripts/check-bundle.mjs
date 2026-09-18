/**
 * Fails if Recast's initial JavaScript payload exceeds its budget.
 *
 * The engines are several megabytes together. They are only ever reached
 * through the registry's `load()`, so none of them may appear in the scripts
 * the first page load pulls in. The usual way that regresses is a stray
 * top-level `import` of SheetJS or pdfjs somewhere in the UI — which nothing
 * else catches, because the site still works, just slowly and enormously.
 *
 * Measures what the browser actually fetches: every script `out/index.html`
 * references, gzipped, summed.
 */
import { gzipSync } from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'out');
const BUDGET_BYTES = 200 * 1024;

/** Engines that must never be in the entry payload, by a string they contain. */
const FORBIDDEN = [
  ['pdfjs', /GlobalWorkerOptions|pdfjsLib/],
  ['SheetJS', /XLSX\.utils|sheet_to_csv/],
  ['mammoth', /mammoth/i],
  ['pptxgenjs', /PptxGenJS/],
];

if (!existsSync(outDir)) {
  console.error('out/ not found — run `pnpm build` first.');
  process.exit(1);
}

const html = readFileSync(join(outDir, 'index.html'), 'utf8');

// Scripts the entry document loads, in the order the browser sees them.
const sources = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

let total = 0;
const rows = [];
const offenders = [];

for (const src of sources) {
  // Strip any basePath prefix; files live under out/ at their _next path.
  const rel = src.replace(/^.*?(_next\/)/, '_next/');
  const file = join(outDir, rel);
  if (!existsSync(file)) continue;

  const raw = readFileSync(file);
  const gz = gzipSync(raw).length;
  total += gz;
  rows.push({ rel, gz, raw: raw.length });

  const text = raw.toString('utf8');
  for (const [name, pattern] of FORBIDDEN) {
    if (pattern.test(text)) offenders.push(`${name} found in entry chunk ${rel}`);
  }
}

rows.sort((a, b) => b.gz - a.gz);
for (const r of rows) {
  console.log(`  ${kb(r.gz).padStart(10)} gz  ${kb(r.raw).padStart(10)} raw  ${r.rel}`);
}

console.log(`\nInitial JS: ${kb(total)} gzipped across ${rows.length} files`);
console.log(`Budget:     ${kb(BUDGET_BYTES)} gzipped`);

let failed = false;

if (offenders.length > 0) {
  console.error('\nAn engine leaked into the initial load:');
  for (const o of offenders) console.error(`  - ${o}`);
  console.error("Engines must only be reached through the registry's load().");
  failed = true;
}

if (total > BUDGET_BYTES) {
  console.error(`\nOver budget by ${kb(total - BUDGET_BYTES)}.`);
  failed = true;
}

// The worker is the whole reason the page stays responsive, and it is built by
// a separate step that is easy to forget. A missing or uncompiled worker breaks
// every conversion in production while every other check stays green.
const workerEntry = join(outDir, 'recast-worker', 'convert.worker.js');
if (!existsSync(workerEntry)) {
  console.error(
    '\nout/recast-worker/convert.worker.js is missing — run `pnpm build:worker`.',
  );
  failed = true;
} else {
  const source = readFileSync(workerEntry, 'utf8');
  if (/^\s*import\s+type\b/m.test(source) || source.includes('interface ')) {
    console.error(
      '\nThe worker looks like uncompiled TypeScript, which no browser will run.',
    );
    failed = true;
  } else {
    console.log(
      `Worker:     ${kb(gzipSync(readFileSync(workerEntry)).length)} gzipped entry (engines load on demand)`,
    );
  }
}

if (failed) process.exit(1);

console.log(`\nUnder budget by ${kb(BUDGET_BYTES - total)}.`);
