/**
 * Drives every converter through the real interface in a real browser.
 *
 * The unit tests call engines directly, which is why they stayed green while
 * the production worker was shipping as uncompiled TypeScript. This script is
 * the check that catches that class of problem: it serves the built export the
 * way a static host would — same MIME rules, same paths — then drops a file on
 * the page, picks a target, clicks Convert and reads back what the browser
 * actually downloaded.
 *
 * It also watches every network request while conversions run, so the claim on
 * the front page ("files never leave your browser") is verified rather than
 * asserted.
 */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'out');
const fixtures = join(root, 'test', 'fixtures');
const downloads = join(process.env.SCRATCH ?? '/tmp', 'kiln-verify');
mkdirSync(downloads, { recursive: true });

/** What a plain static host sends. Deliberately conservative. */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.ttf': 'font/ttf',
  // The trap: a host has no reason to think .ts is JavaScript.
  '.ts': 'video/mp2t',
};

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = join(outDir, url);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }
  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
  });
  res.end(readFileSync(file));
});

await new Promise((resolve) => server.listen(4173, resolve));
const base = 'http://localhost:4173';

/**
 * One fixture per source format. The **targets are not listed here** — they are
 * read off the format picker once the file is dropped.
 *
 * Most pairs Kiln offers are now two converters composed by the router rather
 * than anything written by hand, and a list in this file would be a third copy
 * of the matrix to keep in step with the registry and the snapshot. Reading the
 * interface instead means this script checks exactly what a person is actually
 * offered — which is the only list that matters here.
 */
const SOURCES = [
  'sample.docx',
  'sample.odt',
  'sample.rtf',
  'sample.html',
  'sample.epub',
  'sample.md',
  'sample.txt',
  'sample.pdf',
  'sample.pptx',
  'sample.odp',
  'sample.xlsx',
  'sample.ods',
  'sample.csv',
  'sample.json',
];

/**
 * Words that must appear in the downloaded file, per source.
 *
 * Magic bytes only prove a file is the shape it claims to be. These prove the
 * document actually arrived: every fixture carries the marker, and each source
 * carries something specific to it. Checked on the formats that are readable as
 * text — the compressed ones are covered by the unit suite, which can open them.
 */
const MARKER = 'Kiln fixture marker 4711';
const EXPECTED = {
  'sample.docx': [MARKER, 'Quarterly report', 'Emphasis cell'],
  'sample.odt': [MARKER, 'Field notes', 'Nested item'],
  'sample.md': [MARKER, 'Kiln test document'],
  'sample.txt': [MARKER],
  'sample.rtf': [MARKER, 'Plain paragraph text.'],
  'sample.html': [MARKER, 'Quarterly report', 'Nested bullet'],
  // Chapter three is stored first in the archive and last in the spine, so
  // finding all three proves nothing was dropped and the order test below
  // proves they came back the right way round.
  'sample.epub': [MARKER, 'Chapter one', 'Chapter three'],
  'sample.pdf': [MARKER, 'A printed heading'],
  'sample.xlsx': [MARKER, 'North'],
  'sample.ods': [MARKER, 'North'],
  'sample.csv': [MARKER, 'North'],
  'sample.json': [MARKER, 'North'],
  'sample.pptx': [MARKER, 'Opening slide'],
  'sample.odp': [MARKER, 'Opening slide', 'Second slide'],
};

/**
 * Text that must appear **in this order** in the output.
 *
 * The EPUB fixture's chapters are stored in one order, named in another and
 * spined in a third. Every individual chapter reads perfectly whichever way
 * they come out, so only the order catches a reader that ignored the spine.
 */
const ORDERED = {
  'sample.epub': ['Chapter one', 'Chapter two', 'Chapter three'],
  'sample.odp': ['Opening slide', 'Second slide'],
  'sample.pptx': ['Opening slide', 'Second slide'],
};

/** Formats whose bytes are readable as text without a parser. */
const READABLE = new Set(['md', 'txt', 'csv', 'rtf', 'html', 'json']);

/** Markdown punctuation that must never reach a format that cannot render it. */
const LEAKED_MARKERS = /\*\*|`[^`]|\]\(http/;

const PK = [0x50, 0x4b, 0x03, 0x04];
const SIGNATURE = {
  pdf: [0x25, 0x50, 0x44, 0x46],
  docx: PK,
  xlsx: PK,
  pptx: PK,
  odt: PK,
  ods: PK,
  odp: PK,
  epub: PK,
  zip: PK,
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();

const consoleErrors = [];
const offOrigin = [];
const uploads = [];
const fontFetches = [];

page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on('request', (request) => {
  const url = request.url();
  if (url.endsWith('.ttf')) fontFetches.push(url.replace(base, ''));
  if (!url.startsWith(base) && !url.startsWith('data:') && !url.startsWith('blob:')) {
    offOrigin.push(`${request.method()} ${url}`);
  }
  // Any request carrying a body while a document is loaded is the thing the
  // whole product promises never happens.
  const body = request.postData();
  if (body && body.length > 0)
    uploads.push(`${request.method()} ${url} (${body.length} bytes)`);
});

await page.goto(base, { waitUntil: 'networkidle' });

const results = [];
let failures = 0;

for (const fixtureName of SOURCES) {
  // Ask the interface what it offers for this file, rather than telling it.
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.setInputFiles('input[type=file]', join(fixtures, fixtureName));
  await page.getByRole('radiogroup').first().waitFor({ timeout: 15000 });

  const targets = (
    await page.getByRole('radiogroup').first().getByRole('radio').allTextContents()
  ).map((label) => label.trim().replace(/^\./, ''));

  if (targets.length === 0) {
    console.log(`FAIL ${fixtureName}: the picker offered nothing`);
    failures += 1;
    continue;
  }

  for (const target of targets) {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.setInputFiles('input[type=file]', join(fixtures, fixtureName));

    // Wait for the row, then choose the target.
    await page.getByRole('radiogroup').first().waitFor({ timeout: 15000 });
    await page
      .getByRole('radio', { name: `.${target}`, exact: true })
      .first()
      .click();

    const started = Date.now();
    await page
      .getByRole('button', { name: /^Convert / })
      .first()
      .click();

    let outcome;
    try {
      const downloadButton = page.getByRole('button', { name: /^Download/ }).first();
      await downloadButton.waitFor({ timeout: 90000 });

      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30000 }),
        downloadButton.click(),
      ]);

      const saved = join(
        downloads,
        `${fixtureName}-to-${target}-${download.suggestedFilename()}`,
      );
      await download.saveAs(saved);
      const bytes = readFileSync(saved);

      const suffix = download.suggestedFilename().split('.').pop();
      const expected = SIGNATURE[suffix];
      const headOk = !expected || expected.every((b, i) => bytes[i] === b);

      // Read the words, not just the shape. A file of the right type holding
      // the wrong document passes every other check in this script.
      //
      // Keyed off what actually downloaded, not off the target: a conversion
      // that honestly produces several files (a multi-sheet workbook going to
      // CSV) is offered as one zip, which is not readable as text.
      let contentNote = '';
      if (READABLE.has(suffix)) {
        const text = new TextDecoder().decode(bytes);
        const missing = (EXPECTED[fixtureName] ?? []).filter((w) => !text.includes(w));

        // Reading order, where the source records one that its file order does
        // not match.
        const sequence = ORDERED[fixtureName] ?? [];
        const positions = sequence.map((word) => text.indexOf(word));
        const outOfOrder =
          positions.every((at) => at >= 0) &&
          positions.some((at, i) => i > 0 && at < positions[i - 1]);

        if (missing.length > 0) contentNote = `missing ${missing.join(', ')}`;
        else if (outOfOrder) contentNote = `out of order: ${sequence.join(' then ')}`;
        else if (suffix !== 'md' && suffix !== 'json' && LEAKED_MARKERS.test(text)) {
          contentNote = 'Markdown punctuation leaked into a non-Markdown output';
        }
      }

      outcome = {
        pair: `${fixtureName.replace('sample.', '')} → ${target}`,
        file: download.suggestedFilename(),
        bytes: bytes.length,
        ms: Date.now() - started,
        ok: bytes.length > 0 && headOk && !contentNote,
        note: headOk ? contentNote : `wrong magic bytes for .${suffix}`,
      };
    } catch (error) {
      const failedText = await page
        .locator('li')
        .filter({ hasText: 'Failed' })
        .first()
        .innerText()
        .catch(() => '');
      outcome = {
        pair: `${fixtureName.replace('sample.', '')} → ${target}`,
        file: '-',
        bytes: 0,
        ms: Date.now() - started,
        ok: false,
        note: (failedText || String(error)).replace(/\s+/g, ' ').slice(0, 120),
      };
    }

    if (!outcome.ok) failures += 1;
    results.push(outcome);
    console.log(
      `${outcome.ok ? 'ok  ' : 'FAIL'} ${outcome.pair.padEnd(18)} ${String(outcome.bytes).padStart(8)} B  ${String(outcome.ms).padStart(6)} ms  ${outcome.file} ${outcome.note}`,
    );
  }
}

// --- CJK, where the font is fetched at conversion time ---------------------
//
// The worker resolves the face against its own URL. Node tests stub `fetch`,
// so this is the only thing that proves the path is right in a browser — the
// same blind spot that once let the worker ship as uncompiled TypeScript.
{
  const cjkSource = join(downloads, 'cjk.md');
  writeFileSync(
    cjkSource,
    '# 日本語の文書\n\n日本語のテキストです。Revenue 売上 rose.\n',
  );

  await page.goto(base, { waitUntil: 'networkidle' });
  await page.setInputFiles('input[type=file]', cjkSource);
  await page.getByRole('radiogroup').first().waitFor({ timeout: 15000 });
  await page.getByRole('radio', { name: '.pdf', exact: true }).first().click();
  await page
    .getByRole('button', { name: /^Convert / })
    .first()
    .click();

  let cjkNote = '';
  try {
    const button = page.getByRole('button', { name: /^Download/ }).first();
    await button.waitFor({ timeout: 90000 });
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      button.click(),
    ]);
    const saved = join(downloads, 'cjk-out.pdf');
    await download.saveAs(saved);
    const size = readFileSync(saved).length;
    // A PDF that embedded the whole face would be megabytes; a subset is small.
    cjkNote =
      size > 1000 && size < 400_000
        ? `ok (${(size / 1024).toFixed(0)} KB)`
        : `SUSPICIOUS size ${size}`;
  } catch (error) {
    cjkNote = `FAILED ${String(error).slice(0, 90)}`;
    failures += 1;
  }

  const fetched =
    fontFetches.length > 0 ? fontFetches.join(', ') : 'NONE — the face was never fetched';
  console.log(`\nCJK → pdf: ${cjkNote}; font requested: ${fetched}`);
  if (fontFetches.length === 0) failures += 1;
}

// --- The page must stay usable while a conversion runs ---------------------
await page.goto(base, { waitUntil: 'networkidle' });
await page.setInputFiles('input[type=file]', join(fixtures, 'sample.xlsx'));
await page.getByRole('radiogroup').first().waitFor();
await page.getByRole('radio', { name: '.pdf', exact: true }).first().click();
await page
  .getByRole('button', { name: /^Convert / })
  .first()
  .click();

const clickable = await page
  .getByRole('button', { name: /Choose a document/ })
  .isEnabled()
  .catch(() => false);
const responsive = await page.evaluate(() => {
  const start = performance.now();
  return new Promise((resolve) =>
    requestAnimationFrame(() => resolve(performance.now() - start)),
  );
});

console.log(
  `\nDuring conversion: drop zone interactive=${clickable}, frame latency=${responsive.toFixed(1)}ms`,
);

console.log(
  `\nOff-origin requests: ${offOrigin.length === 0 ? 'none' : offOrigin.join(', ')}`,
);
console.log(
  `Requests with a body: ${uploads.length === 0 ? 'none' : uploads.join(', ')}`,
);
console.log(
  `Console errors: ${consoleErrors.length === 0 ? 'none' : consoleErrors.slice(0, 5).join(' | ')}`,
);

await browser.close();
server.close();

console.log(
  `\n${results.length - failures}/${results.length} pairs converted in the browser.`,
);
if (failures > 0 || offOrigin.length > 0 || uploads.length > 0) process.exit(1);
