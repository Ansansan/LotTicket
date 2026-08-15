# Cold-Audit Remediation Progress

## Done

- Replaced the Codex workflow section in `CLAUDE.md` with the four-stage Sol
  plan → Luna execute → context-bearing Sol review → fresh cold Sol audit loop,
  including bounded repeat fixes, inherited sandbox semantics, and a tracked +
  untracked task-local scope inventory.
- Updated `.codex/agents/sol-cold-reviewer.toml` to retain the Sol Max/read-only
  intent while explicitly requiring behavioral no-edit compliance and
  before/after worktree verification under inherited sandbox policy.
- Removed stale V21 asset references from `.claude/agents/reviewer.md` and
  `.claude/agents/auditor.md`.
- Added `?v=PROD_1_V22` to both V22 asset URLs in `index.html`.
- Extended `scripts/verify.mjs` to require matching asset query tokens, test all
  seven weekdays plus both weekend Nica 7pm cases, and prove the retired Nica
  1pm label is declared and referenced only through history helpers in both web
  apps.
- Preserved the existing V22 release rename/schedule changes, the user's
  PythonAnywhere restart command in `README.md`, and all unrelated working-tree
  changes.

## Not done

- No plan item was skipped. Files already matching the approved plan (including
  `AGENTS.md`, the Luna agent config, V22 assets, Dadan files, `lot_ticket.py`,
  the locked snapshot, and the historical setup plans) were retained without
  unnecessary rewrites.
- Browser deployment, GitHub push, PythonAnywhere restart, staging, and commit
  were not performed because the plan places them out of scope.

## Deviations from plan

- No implementation-scope deviation. `README.md` was not rewritten because its
  canonical examples already required versioned query parameters; its
  pre-existing restart-command edit was preserved byte-for-byte.
- The Windows PowerShell shell could not evaluate the plan's literal Bash
  `$(git merge-base ...)` substitution. The same base-branch diff was run with
  the resolved merge-base (`17be971858435ebcb14c9b6542ea7095b5fa5220`) and is
  listed below.

## Assumptions made during execution

- The pre-Luna working-tree inventory below is the authorized baseline. Existing
  V22 renames and schedule edits were user/previous-worker changes to preserve,
  not fresh edits to redesign.
- `?v=` is validated by its URL query value matching `BOT_VERSION`; additional
  query parameters would not invalidate the required cache token.
- The verifier's deterministic dates (`2026-08-16` through `2026-08-22`) are
  evaluated at UTC noon, matching the web-app helper's date handling.

## Baseline vs final

Pre-Luna tracked diff inventory:

```text
CLAUDE.md
README.md
dadan/index.html
dadan/script.js
index.html
lot_ticket.py
script_v21.js
scripts/locked-snapshot.json
scripts/verify.mjs
style_v21.css
```

Pre-Luna untracked inventory:

```text
.codex/agents/luna-worker.toml
.codex/agents/sol-cold-reviewer.toml
AGENTS.md
plans/2026-08-15-cold-audit-remediation.md
plans/2026-08-15-model-specialized-subagents.md
plans/2026-08-15-model-specialized-subagents.progress.md
script_v22.js
style_v22.css
```

Baseline mechanical results: the initial TOML text assertion failed because the
cold-reviewer config did not yet state inherited sandbox/no-edit verification;
`node --check script_v22.js`, `node --check dadan/script.js`,
`node --check scripts/verify.mjs`, `python -m py_compile lot_ticket.py`,
`node scripts/verify.mjs` (`verify: OK (36 checks)`),
`node scripts/check-locked.mjs` (`check-locked: OK (11 surfaces)`), and
`git diff --check` all passed. The stale-reference search found the two
pre-existing `script_v21` mentions in the Claude reviewer/auditor instructions.

Final relative-to-baseline scope comparison:

```text
new tracked: .claude/agents/auditor.md, .claude/agents/reviewer.md
new untracked: plans/2026-08-15-cold-audit-remediation.progress.md
out of scope: <none>
```

The other tracked and untracked names remain the pre-Luna inventory above.

## Verification results

- `python -c "...tomllib..."` (both `.codex/agents/*.toml`): exit 0; both
  configs reported `OK`, with pinned models/reasoning, sandbox defaults, and
  required instruction text.
- `node --check script_v22.js`: exit 0.
- `node --check dadan/script.js`: exit 0.
- `node --check scripts/verify.mjs`: exit 0.
- `python -m py_compile lot_ticket.py`: exit 0.
- `node scripts/verify.mjs`: `verify: OK (56 checks)`.
- `node scripts/check-locked.mjs`: `check-locked: OK (11 surfaces)`.
- `git diff --check`: exit 0; only expected CRLF normalization warnings were
  emitted.
- `rg -n "script_v21|style_v21|PROD_1_V21" CLAUDE.md README.md index.html
  lot_ticket.py scripts .claude .codex`: exit 1 with no matches.
- `rg -n "CURRENT_VERSION|style_v22|script_v22|\?v=PROD_1_V22" index.html`:
  confirmed `CURRENT_VERSION = "PROD_1_V22"` and both V22 URLs carry the exact
  `?v=PROD_1_V22` query token.

Base-branch file list from the reviewer command
`git diff $(git merge-base HEAD origin/main)...HEAD --name-only -- ':!plans/'`
(resolved merge-base above; these are branch-baseline changes, not all Luna
edits):

```text
.claude/agents/auditor.md
.claude/agents/executor.md
.claude/agents/planner.md
.claude/agents/reviewer.md
.claude/settings.json
.github/workflows/verify.yml
.gitignore
CLAUDE.md
config.example.py
lot_ticket.py
script_v21.js
scripts/check-locked.mjs
scripts/check-staged-secrets.mjs
scripts/check-tracked-secrets.mjs
scripts/git-hooks/pre-commit
scripts/guard-bash-secrets.mjs
scripts/guard-plan-overwrite.mjs
scripts/locked-snapshot.json
scripts/secret-patterns.mjs
scripts/verify.mjs
```

## Remaining risks

- The required fresh, context-free `sol_cold_reviewer` audit and primary Sol
  review remain orchestration steps for the parent agent; this worker did not
  perform or claim either review.
- Visual confirmation was source inspection of the V22 URLs; no browser or
  deployment smoke test was run, consistent with the plan's out-of-scope items.

## Re-run 1 — 2026-08-15

The fresh cold audit found a valid verifier false negative: the prior
`functionNameAt` implementation classified a top-level `LEGACY_LOTTERIES`
alias as belonging to the last preceding history helper. The bounded fix was
limited to `scripts/verify.mjs` and this progress artifact. It now computes
balanced function-body spans with comment/string-aware scanning, requires every
non-declaration legacy reference to be inside exactly one approved history
helper, and includes a negative mutation that appends a top-level active alias
and asserts rejection.

The verifier also now pins `renderLotteryGridForDate` (purchase),
`populateAdminSelect` (admin), and `selectStatsDate` (stats) in both
`script_v22.js` and `dadan/script.js` to `getStandardLotteriesForDate`. A
negative mutation replaces those helper calls with direct `STANDARD_LOTTERIES`
uses and asserts that the gate rejects the bypass. The existing schedule,
payout, version, and legacy-history checks remain intact.

Repeat-cycle verification:

- `node --check scripts/verify.mjs`: exit 0.
- `node --check script_v22.js`: exit 0.
- `node --check dadan/script.js`: exit 0.
- `python -m py_compile lot_ticket.py`: exit 0.
- `node scripts/verify.mjs`: `verify: OK (62 checks)` (the prior 56 checks
  remain covered, with six new consumer/mutation checks).
- `node scripts/check-locked.mjs`: `check-locked: OK (11 surfaces)`.
- TOML model/sandbox/instruction assertions: both agent configs `OK`.
- `git diff --check`: exit 0 with only expected CRLF normalization warnings.
- Stale V21 search: exit 1 with no matches.
- Index inspection still confirms `CURRENT_VERSION = "PROD_1_V22"` and both
  V22 asset URLs carry `?v=PROD_1_V22`.

No staging, commit, push, deployment, or unrelated-file edits were performed.
The next required step is a new fresh cold Sol audit of this repeat cycle.

## Re-run 2 — 2026-08-15

Cold audit 2 identified a verifier-only P2: a mutation replacing a consumer call
with `ACTIVE_STANDARD /* getStandardLotteriesForDate() */` plus a top-level
`const ACTIVE_STANDARD = STANDARD_LOTTERIES;` remained green because the prior
consumer check searched raw source for the helper name and did not constrain the
schedule expression or alias location.

The bounded fix remains limited to `scripts/verify.mjs` and this progress file:

- `maskNonCode` preserves offsets while blanking comments, quoted strings, and
  template text; all consumer/helper/reference searches now use executable-code
  positions rather than raw text.
- `standardReferenceIssues` rejects code-position `STANDARD_LOTTERIES` aliases
  outside its declaration and the actual date-aware helper body. The two
  existing history metadata spreads are explicitly constrained to direct
  spread expressions; indirect aliases are rejected.
- Purchase, admin, and stats consumers now require their role-specific,
  date-aware schedule-producing expressions, not merely a helper-name token.
- Each app runs three independent, syntactically compiled negative mutations
  (purchase/admin/stats): one consumer call is replaced with the exact
  alias/comment bypass and the top-level alias is appended. All six mutations
  must be rejected.

Repeat-cycle 2 verification:

- `node --check scripts/verify.mjs`: exit 0.
- `node --check script_v22.js`: exit 0.
- `node --check dadan/script.js`: exit 0.
- `python -m py_compile lot_ticket.py`: exit 0.
- `node scripts/verify.mjs`: `verify: OK (68 checks)` (the original 56
  contracts remain covered, plus code-position, role-expression, and six
  independent mutation checks).
- `node scripts/check-locked.mjs`: `check-locked: OK (11 surfaces)`.
- TOML model/sandbox/instruction assertions: both agent configs `OK`.
- `git diff --check`: exit 0 with only expected CRLF normalization warnings.
- Stale V21 search: exit 1 with no matches.
- Index inspection still confirms `CURRENT_VERSION = "PROD_1_V22"` and both
  V22 asset URLs carry `?v=PROD_1_V22`.

No staging, commit, push, deployment, or edits outside `scripts/verify.mjs` and
this progress artifact were performed. A new fresh cold audit is required.
