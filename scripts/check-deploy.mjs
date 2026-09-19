/**
 * Asserts that a push to the publishing branch actually published *this* build.
 *
 * Written because run #20 was green and published nothing. The deploy job is
 * gated on a condition, a job whose condition is false is `skipped`, and a
 * skipped job does not fail a run — so the workflow reported success, no
 * deployment record was ever created, and the live site stayed three days old.
 * Nothing in the run said so.
 *
 * Two questions, both asked against the deployed site rather than the workflow's
 * own opinion of itself:
 *
 *   1. Did the deploy job run at all, on a branch where it had to?
 *   2. Is the thing now being served this commit, at the path it belongs at?
 *
 * The second is the one that matters. A deploy can succeed and still leave the
 * wrong bytes at the URL — a stale CDN, a basePath baked for a different
 * repository name — and every check that reads the workflow instead of the site
 * would still be green.
 */

/** How long to keep asking the CDN, which does not always update instantly. */
const TOTAL_WAIT_MS = 90_000;
const GAP_MS = 5_000;

/** The file the build drops into the export so a deploy can be identified. */
export const STAMP = 'build-sha.txt';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {object} input
 * @param {string} input.deployResult   `needs.deploy.result`
 * @param {string} input.refName        the branch that was pushed
 * @param {string} input.defaultBranch  the branch Pages publishes from
 * @param {string} input.pageUrl        what actions/deploy-pages reported
 * @param {string} input.expectedSha    the commit this run built
 * @param {string} input.basePath       the prefix the export was built for
 * @param {typeof fetch} [input.fetchImpl]
 * @param {number} [input.totalWaitMs]
 * @returns {Promise<{ok: boolean, problems: string[], notes: string[]}>}
 */
export async function checkDeploy({
  deployResult,
  refName,
  defaultBranch,
  pageUrl,
  expectedSha,
  basePath,
  fetchImpl = fetch,
  totalWaitMs = TOTAL_WAIT_MS,
}) {
  const problems = [];
  const notes = [];

  // Reached when `build` failed, so its outputs are empty. Without this the
  // next test reads "main !== ''" as "not the publishing branch" and the guard
  // passes with a reassuring sentence about a branch that does not exist.
  if (!defaultBranch) {
    problems.push(
      'could not tell which branch publishes, so whether this should have deployed is unknown',
    );
    return { ok: false, problems, notes };
  }

  // A branch that is not the publishing branch is built and tested and not
  // published, which is deliberate. The only thing worth saying is that it
  // did not somehow fail while doing nothing.
  if (refName !== defaultBranch) {
    notes.push(
      `${refName} is not the publishing branch (${defaultBranch}), so no deploy was expected.`,
    );
    if (deployResult === 'failure' || deployResult === 'cancelled') {
      problems.push(
        `the deploy job ended as "${deployResult}" on a branch it should have skipped`,
      );
    }
    return { ok: problems.length === 0, problems, notes };
  }

  if (deployResult !== 'success') {
    problems.push(
      deployResult === 'skipped'
        ? `the deploy job did not run. A push to ${refName} must publish, and a skipped job does not fail a run on its own — which is exactly how a green run left the site three days stale.`
        : `the deploy job ended as "${deployResult}"`,
    );
    // Nothing was published, so there is no site to ask about.
    return { ok: false, problems, notes };
  }

  if (!pageUrl) {
    problems.push('the deploy job reported no page URL');
    return { ok: false, problems, notes };
  }

  notes.push(`published to ${pageUrl}`);

  // A project site lives at /<repo>/. If the URL says otherwise, every asset in
  // the export is built for a path the site is not served from.
  const wanted = `${basePath.replace(/\/$/, '')}/`;
  const path = new URL(pageUrl).pathname;
  if (path !== wanted) {
    problems.push(`published at ${path}, but this build was made for ${wanted}`);
  }

  const base = pageUrl.endsWith('/') ? pageUrl : `${pageUrl}/`;

  // The stamp is the whole point: it says which commit is being served, so
  // "the deploy succeeded" and "the new build is live" stop being the same
  // claim on trust.
  const stamp = await getWithRetry(
    `${base}${STAMP}`,
    fetchImpl,
    totalWaitMs,
    expectedSha,
  );
  if (!stamp.ok) {
    problems.push(`could not read ${STAMP} from the published site (${stamp.detail})`);
  } else if (stamp.body.trim() !== expectedSha) {
    problems.push(
      `the published site is commit ${stamp.body.trim().slice(0, 8) || '(empty)'}, not ${expectedSha.slice(0, 8)} — the deploy reported success but the old build is still being served`,
    );
  } else {
    notes.push(`serving ${expectedSha.slice(0, 8)}`);
  }

  const page = await getWithRetry(base, fetchImpl, 0);
  if (!page.ok) {
    problems.push(`could not read the published page (${page.detail})`);
  } else if (!page.body.includes(`"${basePath.replace(/\/$/, '')}/_next/`)) {
    problems.push(
      `the published page does not reference ${basePath.replace(/\/$/, '')}/_next/ — its assets would 404`,
    );
  } else {
    notes.push(`assets reference ${basePath.replace(/\/$/, '')}/_next/`);
  }

  return { ok: problems.length === 0, problems, notes };
}

/**
 * Fetches a URL, retrying while the answer is missing or stale.
 *
 * `settleOn` lets the stamp wait for the *right* answer rather than any
 * answer: a CDN mid-update serves the previous deploy with a 200, and giving
 * up at the first success would call that a pass.
 */
async function getWithRetry(url, fetchImpl, totalWaitMs, settleOn) {
  const deadline = Date.now() + totalWaitMs;
  let detail = 'no attempt made';

  for (;;) {
    try {
      const response = await fetchImpl(url, { cache: 'no-store' });
      const body = response.ok ? await response.text() : '';
      if (response.ok && (!settleOn || body.trim() === settleOn)) {
        return { ok: true, body, detail: '' };
      }
      detail = response.ok
        ? `served ${body.trim().slice(0, 12) || '(empty)'}`
        : `HTTP ${response.status}`;
      if (response.ok && settleOn) {
        // Right shape, wrong content. Keep the body so the caller can say what
        // is actually being served rather than only that it timed out.
        if (Date.now() >= deadline) return { ok: true, body, detail };
      }
    } catch (cause) {
      detail = cause instanceof Error ? cause.message : String(cause);
    }

    if (Date.now() >= deadline) return { ok: false, body: '', detail };
    await sleep(Math.min(GAP_MS, Math.max(0, deadline - Date.now())));
  }
}

// --- CLI -------------------------------------------------------------------

const invokedDirectly =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (invokedDirectly) {
  const repo = (process.env.GITHUB_REPOSITORY ?? '').split('/')[1] ?? '';
  const result = await checkDeploy({
    deployResult: process.env.DEPLOY_RESULT ?? '',
    refName: process.env.REF_NAME ?? '',
    defaultBranch: process.env.DEFAULT_BRANCH ?? '',
    pageUrl: process.env.PAGE_URL ?? '',
    expectedSha: process.env.EXPECTED_SHA ?? '',
    basePath: process.env.EXPECTED_BASE_PATH || `/${repo}`,
  });

  for (const note of result.notes) console.log(note);
  for (const problem of result.problems) console.log(`::error::${problem}`);

  console.log(
    result.ok ? '\nThe published site is this build.' : '\nThe deploy did not land.',
  );
  if (!result.ok) process.exit(1);
}
