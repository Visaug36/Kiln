/**
 * Checks that every file path Recast's documentation mentions actually resolves.
 *
 * `CLAUDE.md` pointed at `docs/x2t-spike.md` for four stages while that file
 * only ever existed on another branch. Nobody followed the pointer, so nobody
 * noticed — the same shape as the caveat that claimed links survive `md → docx`:
 * documentation asserting something untrue about itself, where the only reader
 * who would catch it is one who did not need the information.
 *
 * ## What counts as a path
 *
 * Backticked spans and Markdown link targets, filtered hard. A candidate is
 * only checked when its **first segment is something that exists at the repo
 * root**, or when it resolves relative to the file that mentions it.
 *
 * That rule is what keeps the check quiet. Recast's docs are full of paths
 * *inside* a document archive — `word/document.xml`, `xl/charts/`,
 * `META-INF/manifest.xml`, `OEBPS/nav.xhtml` — and none of those are repo
 * files. Their first segment is not a repo entry, so they are skipped without
 * needing a list of exceptions that would itself go stale.
 *
 * The cost is that a typo in an archive path is not caught. That is not what
 * this check is for.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Documentation, and nothing else. Source comments are the compiler's problem. */
const ROOTS = ['CLAUDE.md', 'AGENTS.md', 'README.md', 'docs', '.claude'];

/**
 * Paths that are deliberately not in this checkout, with where they really are.
 *
 * Each one needs a reason. An entry here is a claim that the prose already
 * explains the absence — if it does not, fix the prose instead of adding a line
 * to this list.
 */
const ELSEWHERE = {
  'docs/x2t-spike.md': 'on branch spike/x2t-wasm; every reference says so',
  'docs/spike/': 'on branch spike/x2t-wasm, alongside the write-up',
};

/** Build outputs. Gitignored, and absent in CI until the build has run. */
const BUILT = ['out/', 'public/recast-worker/', 'edge-cost.txt', 'tsconfig.tsbuildinfo'];

/**
 * A line carrying this comment is skipped.
 *
 * For the one honest case the rule above cannot see: a path the documentation is
 * telling you to **create**, not to read. `add-converter` walks through building
 * `rtf-to-pdf.ts`, and that file not existing is the point of the example.
 *
 * It exempts **the line it sits on and the next line with anything on it**, so
 * it reads naturally either at the end of the line it annotates or on its own
 * line above — and a blank line between them, which Prettier is free to add or
 * remove, does not quietly turn the marker off.
 *
 * Write the reason after the marker. It is invisible in rendered Markdown and
 * plainly visible in a diff, which is the right way round: silencing a genuinely
 * broken pointer with it should look like what it is.
 */
const IGNORE = /<!--\s*check-links:/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.name.endsWith('.md')) out.push(path);
  }
  return out;
}

const files = [];
for (const entry of ROOTS) {
  const path = join(root, entry);
  if (!existsSync(path)) continue;
  if (statSync(path).isDirectory()) walk(path, files);
  else files.push(path);
}

const topLevel = new Set(readdirSync(root));

/**
 * Whether a backticked span is plausibly a path at all.
 *
 * Everything with a space is a command or prose. Everything with an arrow is a
 * conversion pair. Everything with a bracket is a call. A bare `.md` is an
 * extension being named, not a file.
 */
function looksLikePath(text) {
  if (!text || text.length > 200) return false;
  if (/^(https?:|mailto:|#|\$|~)/.test(text)) return false;
  if (/[\s→<>|*?"'`(){}[\]]/.test(text)) return false;
  if (/^\.[a-z0-9]+$/i.test(text)) return false;

  const named =
    /[^/]\.(md|mdx|ts|tsx|mjs|cjs|js|jsx|json|css|yml|yaml|txt|snap|ttf|png)$/i;
  return text.includes('/') || named.test(text);
}

/** Candidates, with the line they were found on so a failure can be acted on. */
function candidates(source) {
  const found = [];

  const lines = source.split('\n');
  let exempt = false;

  lines.forEach((line, index) => {
    if (IGNORE.test(line)) {
      exempt = true;
      return;
    }
    if (!line.trim()) return;
    if (exempt) {
      exempt = false;
      return;
    }

    for (const match of line.matchAll(/`([^`\n]+)`/g)) {
      found.push({ text: match[1], line: index + 1 });
    }
    for (const match of line.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      found.push({ text: match[1], line: index + 1 });
    }
  });

  return found;
}

/** Strips prose punctuation that ends up inside a backtick span. */
function clean(text) {
  return text.replace(/[.,;:]+$/, '');
}

const problems = [];
let checked = 0;

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const here = dirname(file);

  // Anything inside a fence is illustrative — example code, sample markup, a
  // shell transcript — and is not asserting that a file exists.
  const prose = source.replace(/^```[\s\S]*?^```/gm, '');

  for (const { text, line } of candidates(prose)) {
    const path = clean(text);
    if (!looksLikePath(path)) continue;
    if (BUILT.some((b) => path === b || path.startsWith(b))) continue;

    const first = path.split('/')[0];
    const nearby = resolve(here, path);
    const fromRoot = resolve(root, path);

    // Relative to the file that mentions it — how a skill points at its own
    // references/ directory.
    if (existsSync(nearby)) {
      checked += 1;
      continue;
    }

    // Not a repo path at all: an archive-internal path, a package name, a URL
    // fragment. Skipped rather than guessed at.
    if (!topLevel.has(first)) continue;

    checked += 1;
    if (existsSync(fromRoot)) continue;

    const excuse = ELSEWHERE[path] ?? ELSEWHERE[`${path}/`];
    if (excuse) continue;

    problems.push({ file: relative(root, file), line, path });
  }
}

const stale = Object.keys(ELSEWHERE).filter((path) => existsSync(resolve(root, path)));

if (problems.length === 0 && stale.length === 0) {
  console.log(
    `Documentation links: ${checked} path${checked === 1 ? '' : 's'} checked across ${files.length} files, all resolve.`,
  );
  if (Object.keys(ELSEWHERE).length > 0) {
    console.log(
      `${Object.keys(ELSEWHERE).length} known to live elsewhere, each with a reason in scripts/check-links.mjs.`,
    );
  }
  process.exit(0);
}

for (const { file, line, path } of problems) {
  console.error(`${file}:${line}  →  ${path}  does not exist`);
}
for (const path of stale) {
  console.error(
    `${path} is listed in ELSEWHERE but is present — remove the entry from scripts/check-links.mjs`,
  );
}
console.error(
  `\n${problems.length + stale.length} broken documentation pointer${problems.length + stale.length === 1 ? '' : 's'}.` +
    `\nFix the path, or move the file. If it genuinely lives elsewhere, say so in the prose` +
    `\nand add it to ELSEWHERE in scripts/check-links.mjs with a reason.`,
);
process.exit(1);
