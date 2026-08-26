---
name: auto-workflow
description: Fully automated development cycle — clarify scope with the user once, then run the canonical primary → executor → verify → cold-audit → triage sequence autonomously (single cold audit, capped fix rounds), ending with a single final report. Use when the user gives a feature/fix request and wants the whole workflow run without further supervision.
---

# Auto Workflow

You are the **orchestrator** (the primary). You run the project's
canonical six-step workflow (CLAUDE.md, "Claude Code workflow (agent
roles)") end-to-end. After Phase 0 (clarification), the user is gone —
do NOT ask "shall I proceed?", do NOT pause between phases. The only
mid-run pause allowed is the hard gate defined below.

The task is whatever follows `/auto-workflow` (or the user's message
invoking this skill).

## Division of labor (non-negotiable)
- Plan authoring is yours to do directly, or delegate to `planner` when
  useful — either way you own the plan text and its approval.
- ALL implementation happens inside the `executor` subagent. You never
  edit code yourself.
- ALL verification commands (`node scripts/verify.mjs`,
  `node scripts/check-locked.mjs`) run on the main loop — you run them,
  not the executor's word for it.
- `executor` commits its own work per its rules (commit per logical
  step, progress file last, never push). You never commit, stage, or
  push yourself. The run ends with commits on the current branch,
  unpushed, for the user to inspect.
- Announce each phase transition to the user in one short line.

## Loop caps
Every retry loop below is capped at **3 rounds**. Hitting a cap is not
an error state to fight through — STOP the run and write the final
report with what cleared and what is still open.

---

## Phase 0 — Clarify (the only routine human touchpoint)
1. Read the relevant code first (Grep/Read/Explore agent) so your
   questions are informed, not generic.
2. Use AskUserQuestion — in batches, as many rounds as needed — until
   there is no material ambiguity about scope, behavior, edge cases,
   and what is explicitly out of scope. Surface things the user's
   request missed (Python ↔ JS payout duplication, whether a version
   bump / release is part of the ask, bot-side vs web-app-side, admin
   vs user surface, deploy implications).
3. Restate the fully-scoped request in one paragraph. Record it
   verbatim. Then start Phase 1 without asking permission.

## Phase 1 — Plan and approval
Write the plan yourself, or spawn `planner` with the scoped request
(verbatim) plus pointers to the code you found in Phase 0. Either way
the output is `plans/<YYYY-MM-DD>-<slug>.md`.

Then apply the locked-invariant hard gate: read the plan's Key Changes
yourself. If it would move ANY surface pinned by
`scripts/locked-snapshot.json`, i.e.:
- the `PROD_1_Vnn` version token (a release / version bump),
- any `AWARDS` value or the Nacional prize-tier constants
  (2000/600/300, 50/20/10, 3/2/1),
- `ADMIN_GROUP_ID` / `ADMIN_USER_ID` / `TOPIC_MAPPING`,
- the Nacional auto-date rule (Wed=2 / Sun=6, 30-day window),
- the `save_results` admin gate or the Actualizar admin-menu gate,
- the SEC-code / guilloche coupling to `SECURITY_SALT`,

then STOP and ask the user for explicit approval via AskUserQuestion
(CLAUDE.md requires a deliberate, acknowledged change here — the
approved change must run `node scripts/check-locked.mjs --update` and
commit the snapshot diff in the same change). If approved, continue;
if not, revise the plan to avoid the invariant (or drop that part of
scope) and re-check.

Then approve the plan yourself: append an `Approved by primary` line to
the plan file (the plan-overwrite guard permits appending to a plan you
just wrote in this run; if it refuses, record the approval in the
progress-file path noted for the executor). The user is not asked to
approve the plan — they inspect the delivered result. The
locked-invariant gate above is the only mid-run AskUserQuestion.

## Phase 2 — Execute
Spawn `executor` with the approved plan path. Remind it: implement only
Key Changes; if it needs a file outside that list, stop and write
`plans/<slug>.revision-requested.md` instead of proceeding; commit each
logical step itself per its own rules (`<slug>: ` subject, progress
file last, never push).
If the executor stops with `plans/<slug>.revision-requested.md`:
revise the plan (yourself or via `planner`) → re-run the Phase 1 gates
→ re-spawn `executor`. This counts against the plan-version cap (never
overwrite a plan; revisions are `<slug>-v2.md`, etc., capped at 3
versions).

## Phase 3 — Verify (main loop)
Run, yourself:
1. `node scripts/verify.mjs`
2. `node scripts/check-locked.mjs`

Any failure → spawn `executor` with the exact failure output to fix
(within Key Changes, committing the fix per its own rules), then rerun
both. Cap: 3 fix rounds.

## Phase 4 — Cold audit (exactly one)
Spawn exactly ONE fresh `auditor` subagent. Coldness lives in the
prompt — use EXACTLY this template, naming only the approved plan path:

> Audit the changes made for the plan at `plans/<YYYY-MM-DD>-<slug>.md` (and any
> `-vN` revisions) in this repository. Run `git status --porcelain`,
> `git log --oneline main..HEAD`, and `git diff main` to see them. You
> may read the approved plan file itself for scope compliance. Do not
> read any `*.progress.md`, `*.revision-requested.md`, or other session
> summary. Apply your Mode A process against CLAUDE.md. Report findings
> and an APPROVE/REJECT verdict.

Prompt hygiene (non-negotiable): beyond the plan path, the auditor
prompt must NEVER contain the scoped request, your own opinions, or any
other conversation content. The auditor receives no inherited
conversation history.

## Phase 5 — Triage (no second audit)
Read the audit findings yourself:
- **Fix it** (default for real findings) → spawn `executor` with the
  concrete findings + the plan path, then rerun the Phase 3 verification
  gates. If a fix needs a file outside Key Changes, route through the
  Phase 1 plan-revision cycle first.
- **Dismiss it** — allowed ONLY if (a) it contradicts CLAUDE.md (e.g.,
  it proposes "fixing" the documented Nacional stack-vs-best-only
  divergence), (b) it is factually wrong and you verified that in the
  code, or (c) `git diff main` proves the flagged code is pre-existing,
  untouched by this change. Every dismissal is recorded with its
  justification in the final report.

There is no second audit round in this workflow — residual findings
that were fixed are covered by the Phase 3 rerun; anything dismissed or
still open goes into the final report as-is.

## Phase 6 — Final report (end of run)
One message, outcome first:
- What was built, in plain language.
- Plan file(s) + progress file path; how many plan versions.
- Verification results (the two Phase 3 commands, actual output
  status).
- The audit round's findings, and for each: fixed (with the re-verify
  result) or dismissed (with its justification).
- Anything still open (cap hits, contested findings).
- Commit list: `git log --oneline main..HEAD`. Explicitly note nothing
  was pushed, and that deployment (GitHub Pages + PythonAnywhere
  restart) remains a manual user step per README.
