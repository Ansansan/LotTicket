# Model-Specialized Codex Workflow Progress

## Completed

- Added `AGENTS.md` as the Codex entrypoint to the repository specification.
- Added `luna_worker` for implementation using `gpt-5.6-luna`, Max reasoning,
  and workspace-write sandboxing.
- Added `sol_cold_reviewer` for independent final audits using `gpt-5.6-sol`,
  Max reasoning, and read-only sandboxing.
- Added the primary Sol Max, Luna implementation, and cold Sol review contract
  to `CLAUDE.md` without removing the existing Claude Code workflow.

## Scope

Only the files listed in the approved workflow plan were changed for this
setup. Pre-existing draw-schedule, cache-version, verification, and README
working-tree changes were preserved and were not attributed to this task.

## Verification

- Parsed both custom-agent files successfully with Python's `tomllib`.
- Confirmed both files contain `name`, `description`, and
  `developer_instructions`.
- Confirmed `luna_worker` pins `gpt-5.6-luna`, Max reasoning, and
  workspace-write sandboxing.
- Confirmed `sol_cold_reviewer` pins `gpt-5.6-sol`, Max reasoning, and
  read-only sandboxing.
- `node scripts/verify.mjs` — passed: 36 checks.
- `node scripts/check-locked.mjs` — passed: 11 locked surfaces.
- `git diff --check` — passed; only existing line-ending conversion warnings
  were emitted.

## Deviations and Remaining Risks

- No implementation deviations.
- Custom-agent discovery and an actual Luna/Sol spawn cannot be proven inside
  the task that created these project files. Open or reload a trusted Codex task
  in this repository, select Sol Max for the primary task, and run the next
  approved implementation through `luna_worker` followed by a fresh
  `sol_cold_reviewer` to complete the end-to-end launcher check.
