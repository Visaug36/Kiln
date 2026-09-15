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
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
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

/** source fixture → every target declared for it. */
const PAIRS = [
  ['sample.docx', ['md', 'txt', 'pdf', 'rtf']],
  ['sample.md', ['docx', 'pdf', 'txt', 'pptx']],
  ['sample.txt', ['md', 'docx', 'pdf']],
  ['sample.rtf', ['txt', 'md']],
  ['sample.pdf', ['txt', 'md']],
  ['sample.xlsx', ['csv', 'md', 'txt', 'pdf', 'docx']],
  ['sample.csv', ['xlsx', 'md', 'txt']],
  ['sample.pptx', ['txt', 'md']],
];

const SIGNATURE = {
  pdf: [0x25, 0x50, 0x44, 0x46],
  docx: [0x50, 0x4b, 0x03, 0x04],
  xlsx: [0x50, 0x4b, 0x03, 0x04],
  pptx: [0x50, 0x4b, 0x03, 0x04],
  zip: [0x50, 0x4b, 0x03, 0x04],
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();

const consoleErrors = [];
const offOrigin = [];
const uploads = [];

page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on('request', (request) => {
  const url = request.url();
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

for (const [fixtureName, targets] of PAIRS) {
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

      outcome = {
        pair: `${fixtureName.replace('sample.', '')} → ${target}`,
        file: download.suggestedFilename(),
        bytes: bytes.length,
        ms: Date.now() - started,
        ok: bytes.length > 0 && headOk,
        note: headOk ? '' : `wrong magic bytes for .${suffix}`,
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
      `${outcome.ok ? 'ok  ' : 'FAIL'} ${outcome.pair.padEnd(16)} ${String(outcome.bytes).padStart(8)} B  ${String(outcome.ms).padStart(6)} ms  ${outcome.file} ${outcome.note}`,
    );
  }
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
