# Model-Specialized Codex Workflow

Status: approved by the user's 2026-08-15 instruction to add the same workflow
used by Overlay Floating Telegram Reader.

## Goal

Keep the primary Sol Max agent focused on investigation, planning,
coordination, review, and final synthesis; delegate approved implementation
work to a Luna Max worker; and use a separate Sol Max read-only agent for the
final cold audit.

## Key Changes

- Add `AGENTS.md` as the Codex entrypoint pointing to the single repository
  specification in `CLAUDE.md`.
- Add `.codex/agents/luna-worker.toml` as the implementation-only custom agent
  using `gpt-5.6-luna`, Max reasoning, and workspace-write sandboxing.
- Add `.codex/agents/sol-cold-reviewer.toml` as the independent audit agent
  using `gpt-5.6-sol`, Max reasoning, and read-only sandboxing.
- Update `CLAUDE.md` with the Codex-specific Sol planning, Luna implementation,
  and cold Sol review contract while retaining the existing Claude Code roles.
- Add `plans/2026-08-15-model-specialized-subagents.progress.md` recording the
  setup and validation results.

No application source, payout rules, schedules, credentials, deployment
settings, or existing user changes are in scope.

## Verification

- Parse both custom-agent files as TOML.
- Confirm the required `name`, `description`, and `developer_instructions`
  fields are present.
- Confirm the Luna worker and Sol reviewer model, effort, and sandbox settings.
- Run `node scripts/verify.mjs` and `node scripts/check-locked.mjs`.
- Inspect the task-local diff and confirm every workflow file is justified by
  this plan and unrelated working-tree changes remain intact.
