# Plans

One markdown file per task, named `YYYY-MM-DD-<slug>.md`. Revisions are
new files: `<slug>-v2.md`, `<slug>-v3.md`, etc. Do not overwrite (the
`guard-plan-overwrite.mjs` PreToolUse hook enforces this).

The executor writes `<slug>.progress.md` at end of run describing what
was done, what deviated, and what was verified.

See `CLAUDE.md` at the repo root for the full planner → executor →
reviewer → auditor workflow.
