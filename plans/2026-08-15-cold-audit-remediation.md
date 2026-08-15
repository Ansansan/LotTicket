# Cold-Audit Remediation and Simplified Sol/Luna Workflow

Status: approved by the user's 2026-08-15 instruction to redo the rejected
changes with the simplified Sol plan → Luna execute → Sol review → cold Sol
audit loop, repeating on a valid cold-audit rejection.

## Context

The first cold Sol audit found no confirmed runtime regression, but rejected the
combined working tree for six reasons: the reviewer sandbox was described as
effectively read-only even though subagents inherit the parent's live policy;
the earlier Nica/V22 work lacked a task plan; task scope checks omitted
untracked files; Claude review instructions referenced deleted V21 assets; the
documented cache-query protocol disagreed with both markup and verification;
and schedule coverage did not prove Sunday or history-only legacy behavior.
The user requested a simpler repeatable workflow and authorized redoing the
changes through it.

## Summary

Ratify and finish the existing Nica/V22 release, repair every actionable cold
audit finding, and simplify the Codex process to four stages: primary Sol plans,
Luna implements, primary Sol reviews, then a fresh Sol performs the cold audit.
If the cold audit rejects with a valid finding, the primary sends bounded fixes
back to Luna, re-reviews, and launches a new cold audit until clean or genuinely
blocked.

## Key Changes

- `CLAUDE.md` — replace the more elaborate Codex wording with the simplified
  review loop; document inherited subagent sandbox behavior honestly; define a
  task-local scope inventory that includes untracked files; keep the existing
  release, invariant, and Claude Code documentation synchronized with V22.
- `AGENTS.md` — retain the single-source pointer to `CLAUDE.md`; no duplicated
  workflow rules.
- `.codex/agents/luna-worker.toml` — retain Luna Max as the sole implementation
  worker and keep its strict approved-file boundary.
- `.codex/agents/sol-cold-reviewer.toml` — retain Sol Max and the read-only
  default, but state that effective sandbox policy is inherited from the parent;
  prohibit edits behaviorally and require before/after worktree verification.
- `.claude/agents/reviewer.md` — remove the stale `script_v21.js` reference and
  derive the live asset from `index.html` or reference V22 consistently.
- `.claude/agents/auditor.md` — remove the stale `script_v21.js` reference and
  audit the asset actually referenced by `index.html`.
- `README.md` — keep the canonical cache-busting protocol requiring versioned
  query parameters; preserve the user's pre-existing PythonAnywhere restart
  command change.
- `index.html` — add `?v=PROD_1_V22` to the V22 stylesheet and script imports
  while preserving `CURRENT_VERSION = "PROD_1_V22"`.
- `lot_ticket.py` — retain the approved `BOT_VERSION = "PROD_1_V22"`; do not
  change bot behavior or credentials.
- `script_v21.js` / `script_v22.js` — retain the cache-busting rename and the
  Nica noon/weekend implementation; preserve payout logic and legacy 1pm
  history compatibility.
- `style_v21.css` / `style_v22.css` — retain the cache-busting rename with no
  semantic CSS change.
- `dadan/index.html` — retain the Dadan cache token bump associated with its
  schedule update.
- `dadan/script.js` — retain the matching Nica noon/weekend behavior and legacy
  history handling.
- `scripts/locked-snapshot.json` — retain the deliberate V22 version token and
  all other locked values unchanged.
- `scripts/verify.mjs` — accept and require the documented version query
  parameters, assert they equal `BOT_VERSION`, cover all seven weekdays,
  enforce both Saturday and Sunday Nica 7pm behavior, and prove that the retired
  Nica 1pm list is referenced only by history helpers in both web apps.
- `plans/2026-08-15-model-specialized-subagents.md` and
  `plans/2026-08-15-model-specialized-subagents.progress.md` — retain the
  original setup record as historical context; do not rewrite either file.
- `plans/2026-08-15-cold-audit-remediation.progress.md` — record Luna's exact
  edits, validation, deviations, baseline handling, and residual risks.

## Out of Scope

- Changing payout amounts, Nacional rules, admin authorization, security salt
  behavior, topic mappings, database schemas, API contracts, or credentials.
- Browser deployment, GitHub push, PythonAnywhere restart, staging, or commit.
- Rewriting the user's pre-existing `README.md` restart-command change.
- Adding parallel write agents or additional planner/reviewer roles.
- Claiming OS-enforced read-only behavior when the parent task uses a
  workspace-write permission mode.

## Interfaces / Contracts

- Current Nica labels remain `Nica 12:00 m`, `Nica 4:00 pm`, weekend-only
  `Nica 7:00 pm`, and `Nica 10:00 pm`; retired `Nica 1:00 pm` remains readable
  only for historical ticket metadata.
- `BOT_VERSION`, `CURRENT_VERSION`, V22 asset filenames, and each asset's `?v=`
  query must all equal `PROD_1_V22`.
- The Python and frontend `AWARDS` tables and all locked invariants remain
  unchanged.
- Luna is the only implementation writer after this plan. The primary Sol does
  not edit implementation files concurrently.
- Primary review is context-bearing. Each cold audit uses a fresh Sol Max agent
  with `fork_turns = "none"`; regardless of inherited sandbox policy, it must
  not edit and the primary verifies that the working tree is unchanged.

## Assumptions & Decisions

- The user's “re-do” instruction is treated as approval of this remediation and
  of the simplified repeat loop, rather than a request for documentation only.
- The earlier Nica/V22 changes are ratified within this plan because separating
  them from the current dirty tree would require destructive or history-altering
  Git operations that the user did not request.
- The task baseline is the pre-Luna `git status --short` inventory recorded in
  the handoff. Scope review compares both `git diff --name-only` and
  `git ls-files --others --exclude-standard` against that baseline and this
  plan, excluding plan/progress artifacts by design.
- Official OpenAI documentation says subagents inherit the current sandbox
  policy. Therefore `sandbox_mode = "read-only"` is retained as the custom
  agent's default intent, but correctness relies on explicit no-edit
  instructions plus before/after worktree verification when the parent is
  workspace-write. Pretending the child is OS-enforced read-only was rejected.
- The simplified loop repeats after valid cold-audit findings until approval or
  a genuine blocker; it does not add parallel writers or an arbitrary fixed
  number of orchestration phases.
- Files read while planning: `AGENTS.md`, `CLAUDE.md`, `scripts/verify.mjs`,
  `.claude/agents/reviewer.md`, `.claude/agents/auditor.md`, `README.md`, and
  `index.html`. More than five were required because the audit findings cross
  workflow, cache protocol, and verification surfaces.

## Verification

- **Mechanical:** Parse both `.codex/agents/*.toml` files with Python
  `tomllib`; assert model, reasoning effort, sandbox default, and required text
  fields.
- **Mechanical:** `node --check script_v22.js`.
- **Mechanical:** `node --check dadan/script.js`.
- **Mechanical:** `node --check scripts/verify.mjs`.
- **Mechanical:** `python -m py_compile lot_ticket.py`.
- **Mechanical:** `node scripts/verify.mjs`.
- **Mechanical:** `node scripts/check-locked.mjs`.
- **Mechanical:** `git diff --check`.
- **Mechanical:** Compare `git diff --name-only` and
  `git ls-files --others --exclude-standard` with the recorded pre-Luna
  baseline and the plan's Key Changes.
- **Mechanical:** Search live instructions for stale V21 references outside
  historical plans: `rg -n "script_v21|style_v21|PROD_1_V21" CLAUDE.md README.md
  index.html lot_ticket.py scripts .claude .codex`.
- **Visual (manual):** Inspect `index.html` and confirm both V22 asset URLs carry
  the exact `PROD_1_V22` query token.
- **Visual (manual):** Inspect the final workflow text and confirm it describes
  only Sol plan → Luna execute → Sol review → fresh cold Sol audit → repeat.

## Definition of Done

- [ ] Every actionable cold-audit finding is fixed or explicitly resolved by an
  evidence-backed contract decision.
- [ ] Luna Max performed all implementation edits after plan approval.
- [ ] Primary Sol independently reviewed the diff and reran required checks.
- [ ] The cache protocol is consistent across README, markup, and verifier.
- [ ] Schedule verification covers all weekdays, both weekend days, and
  history-only legacy references in both web apps.
- [ ] Live reviewer/auditor instructions contain no stale V21 asset reference.
- [ ] Task scope accounting includes tracked and untracked files and preserves
  unrelated pre-existing changes.
- [ ] A fresh Sol Max cold audit returns APPROVE, or any valid rejection is sent
  back to Luna and the review cycle repeats.
- [ ] Nothing is staged, committed, pushed, deployed, or restarted.
