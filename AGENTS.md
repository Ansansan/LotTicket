# LotTicket

The complete repository specification lives in `CLAUDE.md` at the repository
root. Read it in full before doing any work. Its architecture, invariants,
verification requirements, secret-handling rules, and deployment restrictions
apply regardless of which assistant is operating in this repository.

## Codex workflow

Codex follows the same primary-driven six-step structure as the current Claude
Code workflow, adapted to the project Codex agents in `.codex/agents/`:

1. The primary must be **GPT-5.6 Sol at Max reasoning**. It investigates the
   request, writes and approves the plan, coordinates the task, evaluates the
   audit, and owns the final response. The user inspects the delivered result;
   routine plan approval is not a human gate.
2. After plan approval, delegate all implementation to `luna_worker`. Luna is
   the sole implementation writer and may modify only files listed in the
   approved plan's **Key Changes**. It preserves unrelated working-tree changes,
   runs the plan's validation, and writes the progress report. If another file
   is needed, it stops and writes the required revision-requested report.
3. Codex uses the existing **leave-uncommitted policy**: Luna does not stage,
   commit, push, or deploy. The primary also does not stage, commit, push, or
   deploy unless the user explicitly requests that action.
4. The primary independently runs `node scripts/verify.mjs` and
   `node scripts/check-locked.mjs`; it does not rely on Luna's report as proof.
5. Launch exactly one fresh `sol_cold_reviewer` with no inherited conversation
   history after implementation and primary verification. The cold reviewer may
   read the final approved plan for scope compliance, but never a progress or
   revision report, session summary, or the primary's conclusions. It remains
   behaviorally read-only and verifies that the worktree is unchanged by its
   audit.
6. The primary evaluates the audit. Valid findings go back to Luna as a bounded
   fix within the approved plan, followed by primary re-verification. There is
   no second cold-audit round. The final response reports the result, actual
   verification status, audit disposition, changed-file scope, and anything
   still open.

The `planner` and `reviewer` skills are optional helpers, not mandatory workflow
stages. Do not let the primary or another write-capable agent edit implementation
files concurrently with `luna_worker`.

Before implementation, record both tracked and untracked task-local scope with
`git diff --name-only` and `git ls-files --others --exclude-standard`. After
implementation, every changed file must be justified by the final approved
plan; plan and progress artifacts are reported separately.

The locked-invariant gate in `CLAUDE.md` still requires explicit user approval
before a plan changes any surface pinned by `scripts/locked-snapshot.json`, and
an approved invariant change must run `node scripts/check-locked.mjs --update`
in the same change.

If the required primary model, `luna_worker`, `sol_cold_reviewer`, or a pinned
agent model is unavailable, stop and report the limitation. Never silently
substitute another role or collapse the independent audit into the primary
thread.

If this Codex workflow conflicts with the older Codex workflow section in
`CLAUDE.md`, this file controls the Codex orchestration only. `CLAUDE.md` remains
authoritative for all repository and product requirements.
