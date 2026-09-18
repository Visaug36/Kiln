# What each check proves, and what its failures look like

A checklist nobody understands gets run and not read. This is what each step is
actually for.

---

## `pnpm lint` / `pnpm typecheck`

Cheap, and the typecheck already ran after every edit via the `PostToolUse` hook.
Running them again costs five seconds and catches the case where the hook was
disabled or the last edit landed some other way.

---

## `pnpm test`

**Proves:** the engines behave, and the registry has not drifted from itself.

Three failures worth recognising on sight:

**A snapshot diff in `routing.test.ts`.** One new edge routinely adds a dozen
pairs. **Read the diff before updating it** — it is the only place a change to
which pairs exist becomes visible, and `-u` makes that visibility go away.

**`index.test.ts` — "declared but no engine" / "engine but not declared".** The
table and the engine map are separate modules on purpose, and nothing but this
test stops them drifting.

**`capacity.test.ts` — "has no measured cost".** A new edge with no entry in
`EDGE_COST`. Do not paste a plausible number in; see the `measure-memory` skill.

A green suite proves less than it looks like. It has been green over five real
bugs at once, twice.

---

## `pnpm check:links`

**Proves:** the documentation does not assert something untrue about itself.

The same shape as the false caveat, one level up. `CLAUDE.md` referenced
`docs/x2t-spike.md` for four stages while that file existed only on
`spike/x2t-wasm`. The only reader who would have caught it is one who followed
the pointer — and anybody who followed it needed the information and did not get
it.

It resolves backticked paths and Markdown link targets in `CLAUDE.md`,
`AGENTS.md`, `README.md`, `docs/` and `.claude/`. A candidate is checked only
when its first segment exists at the repo root, or when it resolves relative to
the file that mentions it. That rule is what keeps it quiet: Recast's docs are full
of paths _inside_ a document archive — `word/document.xml`, `META-INF/`,
`OEBPS/` — and none of those are repo files.

### When it fails

- **A typo or a moved file** — fix the path. This is the case it exists for.
- **A file the documentation tells you to create**, like the `rtf-to-pdf.ts` in
  the `add-converter` worked example — put `<!-- check-links: reason -->` on the
  line, or on its own line above it. Invisible when rendered, visible in a diff.
- **A file that genuinely lives elsewhere** — say where in the prose, then add it
  to `ELSEWHERE` in `scripts/check-links.mjs` with a reason. The script also
  fails if an `ELSEWHERE` entry turns out to be present, so that list cannot
  quietly go stale either.

Do not reach for the ignore marker first. Two of the three cases above are the
documentation being wrong.

---

## `pnpm build && pnpm check:bundle`

**Proves:** the static export builds, and the page has not quietly gained an
engine.

The number to read is **Initial JS**, gzipped, against the 200 KB budget. The
usual cause of a jump is a dynamic `import()` reaching a module the page imports,
which makes the bundler emit a chunk per engine — about 4 MB built, deployed and
never fetched. `lib/registry/table.ts` and everything it touches must contain no
`import()` at all.

Order matters: `check:bundle` reads `out/`, so a stale build passes a check it
should have failed.

---

## `pnpm verify:browser`

**Proves** four things nothing else does.

**That the worker actually runs.** The unit tests call engines directly. The
production worker once shipped as uncompiled TypeScript and the suite stayed
green, because nothing tested the thing a browser would fetch.

**That the output is the right document.** Magic bytes only prove a file is the
shape it claims. The script reads the bytes back and looks for words the fixture
carries, plus order where the source records one — EPUB chapters are stored,
named and spined in three different orders precisely so that a reader ignoring
the spine fails here.

**That the privacy promise holds.** Every request is watched while conversions
run. Off-origin requests: none. Requests with a body: none. **This is the only
place that claim is verified rather than asserted.**

**That the pair count is real.** The script asks the interface what it offers
rather than carrying its own list, so a pair that disappeared from the registry
shows up as a smaller number.

**That the assets resolve where they will be served.** Set
`NEXT_PUBLIC_BASE_PATH` on both the build and the run and the export is served
under the same prefix a Pages project site uses, with any request outside it
counted as a missing asset. That is the check for a renamed repository: the site
moves to a new prefix, the build keeps the old one, and the page still renders
its heading from static HTML while nothing on it works.

### When it fails

- **One pair fails, the rest pass** — an engine bug. Reach for `probe`; do not
  fix it from the script's output alone.
- **Every pair fails** — the build, the server or the worker. Check the build
  landed in `out/` first.
- **Assets missing, every pair fails** — the build and the run disagree about
  `NEXT_PUBLIC_BASE_PATH`. Give both the same value.
- **An off-origin request appears** — stop. This is the inviolable rule, and a
  dependency that fetches at runtime is disqualified whatever else it does.
- **A console error with no failed pair** — still a defect. Recast's interface
  shows sentences, not exceptions.

### What it does not cover

Mobile Safari, which is Chromium-only here and the reason the iOS memory
threshold is still a guess. And anything about how the page _looks_ — there is no
rasteriser in CI.

---

## Reconciling `docs/`

**Proves:** the next session starts where this one ended instead of rediscovering
it.

The failure mode is specific: a history nobody updates is worse than none,
because it is confidently stale. A DECISIONS entry that no longer reflects the
code will be trusted and acted on.

Two questions worth asking explicitly at the end of a stage:

**"What did I decide that a fresh session would re-propose?"** That is a
DECISIONS entry, and the rejected alternative is the valuable half.

**"What did I notice and not fix?"** That is an OPEN entry. The commit message is
not a home for it — nobody greps commit bodies.

---

## Commit and deploy

`git status --porcelain`, then **stage by name**. A blanket `git add` swept a
subagent's scratch probe into a commit once: eight tests with no assertions that
could never fail, pushed unread.

The deploy runs the same checks again on a clean checkout, which catches the
thing that only worked because of something untracked in the working tree. Watch
it go green rather than assuming it.

---

## Before calling it done

- Does every pair still convert, with its output read back?
- Off-origin requests: none. Request bodies: none.
- Entry chunk under budget.
- Does `OPEN.md` still describe reality — nothing closed still listed, nothing
  noticed and unrecorded?
- Does every path the documentation mentions still resolve? `pnpm check:links`.
- Does any caveat now claim something that is no longer true? Routing spreads a
  false one across every pair routed through that edge.
- Did the stage change how the work is done? That belongs in a skill, not only
  in the commit message.
