import { createServer, get, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM script, no types, imported for its logic.
import { checkDeploy, STAMP } from '../scripts/check-deploy.mjs';

/**
 * The negative controls for the deploy guard.
 *
 * The guard exists because a green workflow published nothing and nobody could
 * tell. A guard for that failure is worth exactly as much as its ability to
 * fail, so every way it is supposed to catch something is exercised here —
 * against a real server serving real bytes, not a mock that agrees with it.
 */

const SHA = 'd273262d072a9242adf7009c08cd540044486a2a';
const OLD_SHA = '0502cd577c4179cd86d114c5f4c7977b3082ee23';
const BASE_PATH = '/Recast';

/**
 * A real HTTP GET, because `test/setup.ts` replaces the global `fetch` with a
 * reader for the CJK font files. Passing the client in also pins the narrow
 * contract the script actually depends on: `ok`, `status` and `text()`.
 */
const httpGet: typeof fetch = ((url: string) =>
  new Promise((resolve, reject) => {
    get(url, (response) => {
      let body = '';
      response.on('data', (chunk) => (body += chunk));
      response.on('end', () =>
        resolve({
          ok: (response.statusCode ?? 0) >= 200 && (response.statusCode ?? 0) < 300,
          status: response.statusCode ?? 0,
          text: async () => body,
        } as Response),
      );
    }).on('error', reject);
  })) as unknown as typeof fetch;

/** What the site is serving right now, swapped per test. */
let served = { stamp: SHA, page: `<script src="${BASE_PATH}/_next/app.js"></script>` };
let server: Server;
let origin: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0];
    if (url === `${BASE_PATH}/${STAMP}`) {
      if (served.stamp === null) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(served.stamp);
      return;
    }
    if (url === `${BASE_PATH}/`) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(served.page);
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  origin = `http://localhost:${typeof address === 'object' && address ? address.port : 0}`;
});

afterAll(() => server.close());

/** A run on the publishing branch whose deploy reported success. */
const goodRun = () => ({
  deployResult: 'success',
  refName: 'main',
  defaultBranch: 'main',
  pageUrl: `${origin}${BASE_PATH}/`,
  expectedSha: SHA,
  basePath: BASE_PATH,
  fetchImpl: httpGet,
  // No waiting: every test here knows what is being served, so a retry window
  // would only make the suite slow.
  totalWaitMs: 0,
});

describe('a deploy that landed', () => {
  it('passes when the published site is this commit at the right path', async () => {
    served = { stamp: SHA, page: `<script src="${BASE_PATH}/_next/app.js"></script>` };

    const result = await checkDeploy(goodRun());
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.notes.join(' ')).toContain('serving d273262d');
  });
});

describe('the failure that started this', () => {
  it('fails when the deploy job was skipped on the publishing branch', async () => {
    // Run #20 exactly: green run, deploy skipped, nothing published, no
    // deployment record, live site three days old.
    const result = await checkDeploy({ ...goodRun(), deployResult: 'skipped' });

    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/did not run/);
  });

  it('fails when the deploy job errored', async () => {
    // Runs #21 and #22: rejected by the environment protection rule.
    const result = await checkDeploy({ ...goodRun(), deployResult: 'failure' });

    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/ended as "failure"/);
  });

  it('does not ask the site anything when nothing was published', async () => {
    served = { stamp: null as unknown as string, page: '' };
    const result = await checkDeploy({ ...goodRun(), deployResult: 'skipped' });

    // One problem, about the job — not a pile of fetch failures that bury it.
    expect(result.problems).toHaveLength(1);
  });
});

describe('a deploy that reported success and served the wrong thing', () => {
  it('fails when the live site is still the previous commit', async () => {
    // The shape nobody catches by reading the workflow: deploy green, CDN or
    // Pages still serving what was there before.
    served = {
      stamp: OLD_SHA,
      page: `<script src="${BASE_PATH}/_next/app.js"></script>`,
    };

    const result = await checkDeploy(goodRun());
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/is commit 0502cd57, not d273262d/);
  });

  it('fails when the stamp is missing altogether', async () => {
    served = { stamp: null as unknown as string, page: '<html></html>' };

    const result = await checkDeploy(goodRun());
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(new RegExp(`could not read ${STAMP}`));
  });

  it('fails when the page was built for a different basePath', async () => {
    // The rename trap, seen from the far end: the right commit is live and
    // every asset on it points at the old repository name.
    served = { stamp: SHA, page: `<script src="/Kiln/_next/app.js"></script>` };

    const result = await checkDeploy(goodRun());
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/does not reference \/Recast\/_next\//);
  });

  it('fails when Pages published it at the wrong path', async () => {
    served = { stamp: SHA, page: `<script src="${BASE_PATH}/_next/app.js"></script>` };

    const result = await checkDeploy({
      ...goodRun(),
      pageUrl: `${origin}/Kiln/`,
    });

    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(
      /published at \/Kiln\/, but this build was made for \/Recast\//,
    );
  });

  it('fails when the deploy job reported no URL at all', async () => {
    const result = await checkDeploy({ ...goodRun(), pageUrl: '' });

    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/no page URL/);
  });
});

describe('when the build failed and there is nothing to go on', () => {
  it('fails rather than reassuring, because the branch is unknown', async () => {
    // `needs.build.outputs` are empty when build failed. Without this the
    // "not the publishing branch" test reads main !== '' as a deliberate skip
    // and the guard passes with a sentence about a branch that does not exist.
    const result = await checkDeploy({ ...goodRun(), defaultBranch: '' });

    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/could not tell which branch publishes/);
  });
});

describe('a branch that is not the publishing branch', () => {
  it('accepts a skipped deploy, because that is the point of the gate', async () => {
    const result = await checkDeploy({
      ...goodRun(),
      refName: 'claude/some-feature',
      deployResult: 'skipped',
    });

    expect(result.ok).toBe(true);
    expect(result.notes.join(' ')).toContain('not the publishing branch');
  });

  it('still objects if the deploy failed while doing nothing', async () => {
    const result = await checkDeploy({
      ...goodRun(),
      refName: 'claude/some-feature',
      deployResult: 'failure',
    });

    expect(result.ok).toBe(false);
  });
});

describe('waiting for a CDN that has not caught up', () => {
  it('keeps asking, and passes once the new commit appears', async () => {
    served = {
      stamp: OLD_SHA,
      page: `<script src="${BASE_PATH}/_next/app.js"></script>`,
    };
    setTimeout(() => {
      served = { ...served, stamp: SHA };
    }, 150);

    const result = await checkDeploy({ ...goodRun(), totalWaitMs: 4_000 });

    // A mid-update CDN serves the previous deploy with a 200, so settling on
    // the first successful response would call that a pass.
    expect(result.problems).toEqual([]);
  }, 20_000);
});
