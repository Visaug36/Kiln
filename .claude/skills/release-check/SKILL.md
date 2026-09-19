---
name: release-check
description: Use when a stage of work on Recast is finishing — "is this done", "ready to ship", "wrap this up", "run the verification pass", "check everything before I commit", "let's close this out", before writing the commit for a stage, or after pushing when the deploy needs confirming. Also use when asked whether the privacy promise still holds, or whether the entry chunk is still under budget.
---

# Finishing a stage

The hooks already cover the cheap half — `pnpm typecheck` after every edit,
`pnpm test && pnpm build && pnpm check:bundle` when a turn ends. **This skill is
the half they cannot cover**: a four-minute browser pass nobody wants on every
turn, the deploy, and reconciling what is now written down.

Run it in this order. Later steps depend on earlier ones.

## 1. The cheap checks, deliberately

```bash
pnpm lint && pnpm typecheck && pnpm check:links && pnpm test && pnpm build && pnpm check:bundle
```

The Stop hook runs most of this, which is exactly why it is easy to assume it
passed. Run it and read it. `check:bundle` reads `out/`, so the build must come
first — checking a stale build is worse than not checking.

**Entry chunk under 200 KB gzipped.** Engine size is not counted and is not a
reason to reject a good engine.

**`check:links` is the one the hooks do not run.** It resolves every file path
`CLAUDE.md`, `docs/` and the skills mention. `CLAUDE.md` pointed at a spike
write-up that only existed on another branch for four stages, and nobody noticed
because nobody followed it. It also runs in CI, so a broken pointer fails the
deploy rather than waiting to be spotted.

## 2. Every pair in a real browser

```bash
# The prefix is the repository name, the same value CI derives from
# GITHUB_REPOSITORY. Deriving it here too means it survives a rename.
BASE="/$(basename -s .git "$(git remote get-url origin)")"

NEXT_PUBLIC_BASE_PATH="$BASE" pnpm build
NEXT_PUBLIC_BASE_PATH="$BASE" pnpm verify:browser
```

The prefix matters. A Pages project site is served from `/<repo>`, and that
value is baked into every asset URL at build time, so give the build and the run
the same one and this reproduces the published site rather than a version of it
that only works from the root. Drop it from both to check the root case.

This is the check that catches what nothing earlier can. The unit tests call
engines directly, which is how the production worker once shipped as uncompiled
TypeScript with a green suite. It serves the built export the way a static host
would, drops a file on the real page, clicks Convert, and **reads the downloaded
bytes back** — content, not just size.

Four things must all appear at the end:

```
Off-origin requests: none
Requests with a body: none
Console errors: none
Assets served at /<repo>: all found

114/114 pairs converted in the browser.
```

`Assets served at ... : all found` is the other half. A build carrying the wrong
prefix 404s every script and still renders the page's heading from static HTML,
which is why looking at the deployed site is not the check.

**That is the privacy verification.** It is not asserted anywhere else, and it is
the product's one promise. The pair count comes from the interface itself — the
script reads the format picker rather than carrying its own list — so a pair that
vanished from the registry shows up as a smaller number, not as a pass.

## 3. Reconcile what is written down

Part of the definition of done, not a nice-to-have:

- **`docs/STAGES.md`** — a new entry at the top. What shipped, what broke, what
  it taught. Count bugs and point at `known-bugs.md`; do not re-describe them.
- **`docs/DECISIONS.md`** — any decision that would change the product if
  reversed, _including what was rejected_. That is the half a future session
  cannot reconstruct.
- **`docs/OPEN.md`** — close what closed, add what opened. **A closed item moves
  to `DECISIONS.md`, it is not deleted.**
- **`known-bugs.md`** — an entry per bug found, with the test that pins it.
- **`CLAUDE.md`** — only if a rule or a headline number changed. It points at
  `OPEN.md` rather than repeating it, so the issue list is one file's job.
- **`README.md`** — only if the support matrix changed.

Then `pnpm check:links` again: reconciling docs is exactly when a pointer gets
written to a file that has moved or does not exist yet.

## 4. Commit, push, confirm the deploy

`git status --porcelain` first, and **stage by name** — never `git add -A` while
a subagent is running.

Then watch the deploy actually go green rather than assuming it. CI runs lint,
typecheck, tests, the build, the bundle budget and the `.nojekyll` guard.

## Reference

`references/checklist.md` has what each check proves, what its failures look
like, which are safe to defer, and the questions to ask before calling a stage
done.
