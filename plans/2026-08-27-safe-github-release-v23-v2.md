# Safe GitHub release: LotTicket V23 + current Overlay (v2)

Date: 2026-08-27
Slug: `safe-github-release-v23-v2`

## Context

The user authorized publishing both repositories to GitHub `main`, requested
an incremented release version, and required images, receipts, personal data,
temporary material, local configuration, and secrets to be excluded. The v1
plan omitted `scripts/verify.mjs`, which hard-codes `script_v22.js`; the worker
correctly stopped and wrote `safe-github-release-v23.revision-requested.md`
without implementation changes. This v2 plan adds that required verifier file.

LotTicket is one committed workflow update ahead of `origin/main` plus the
completed Bot1 sync work. Overlay is 358 commits ahead of `origin/main` plus a
tested dirty working tree containing intentional app changes and unsafe/local
material.

## Summary

- Publish LotTicket as `PROD_1_V23` with a mechanically identical V23 copy of
  the current web assets and a verifier updated to resolve the referenced
  current script dynamically/V23-correctly.
- Publish Overlay's current intentional application source state and Bot1
  integration. Its Git-derived version increments through the release commit.
- Curate both commits with path-specific staging; never bulk-stage.
- Exclude and ignore high-risk image, receipt, artifact, temp, and handoff
  paths, and exclude unreviewed historical Overlay plans.

## Key Changes (exhaustive implementation/release scope)

### LotTicket

1. `lot_ticket.py`: change `BOT_VERSION` from `PROD_1_V22` to
   `PROD_1_V23`; preserve all ticket-sync behavior.
2. `index.html`: change `CURRENT_VERSION`, CSS/JS filenames, and query tokens
   to V23.
3. Rename `script_v22.js` to `script_v23.js` byte-identically.
4. Rename `style_v22.css` to `style_v23.css` byte-identically.
5. `scripts/verify.mjs`: replace V22-specific current-script literals/paths
   with V23-correct or index-derived current-asset handling, preserving every
   payout/schedule/anti-tamper check and its fail-closed behavior.
6. `CLAUDE.md` and `README.md`: update current literal asset/release references
   to V23 without changing product rules.
7. `scripts/locked-snapshot.json`: acknowledge the user-approved version
   change using `node scripts/check-locked.mjs --update`.
8. Release the already completed ticket-sync/workflow scope:
   `.github/workflows/verify.yml`, `AGENTS.md`, `config.example.py`,
   `requirements.txt`, `ticket_sync.py`, `tests/test_ticket_sync.py`,
   `scripts/secret-patterns.mjs`, `scripts/secret-patterns.test.mjs`,
   `plans/2026-08-27-bot1-overlay-ticket-sync.md`, and
   `plans/bot1-overlay-ticket-sync.progress.md`, together with the overlapping
   final `lot_ticket.py`, `CLAUDE.md`, and `README.md`.
9. Release planning artifacts:
   `plans/2026-08-27-safe-github-release-v23.md`,
   `plans/safe-github-release-v23.revision-requested.md`, this v2 plan, and
   new `plans/safe-github-release-v23-v2.progress.md`.

### Overlay

10. `.gitignore`: append `.tmp-*/`, `artifacts/`,
    `bank transfer examples/`, `hand written lists examples/`,
    `yappy receipts examples/`, and `HANDOFF-*.md`.
11. Release all currently modified/deleted tracked files from the pre-release
    status, including the root/scoped `AGENTS.md`, existing
    `.codex/agents/sol-cold-reviewer.toml`, Android source/resources/tests, and
    intended removal of obsolete Grab-card files.
12. Release only these safe untracked categories:
    - `.codex/config.toml`, `.codex/hooks.json`, `.codex/agents/planner.toml`;
    - new `app/src/main/java/com/yappy/overlay/**` Kotlin sources;
    - new `app/src/main/res/**` XML resources;
    - new `app/src/test/java/com/yappy/overlay/**` Kotlin tests.
13. Include all completed Bot1-specific files/hunks within that scope.
14. Do not edit `app/build.gradle.kts`; its existing commit-count version
    derivation increments the APK version automatically.

## Out of scope / explicit exclusions

- `.tmp-*`, `artifacts/`, all screenshots/device captures, receipt/example
  image folders, `HANDOFF-*.md`, local config/secrets/keystores/build output.
- Untracked historical Overlay `plans/**`.
- Force-push, history rewrite, PythonAnywhere restart, APK build delivery, or
  any cleanup/deletion of excluded local files.

## Interfaces / contracts

- LotTicket runtime/web version invariant becomes exactly `PROD_1_V23`; V23
  asset bytes stay identical to their V22 predecessors.
- Overlay version remains `git rev-list --count HEAD` derived.
- Both pushes must be non-force fast-forwards to `origin/main`.
- No secret or personal-data candidate may appear in either staged snapshot.

## Assumptions & decisions

- The user explicitly approved the locked LotTicket version increment.
- Existing committed Overlay history (358 commits ahead) is intentional and
  will fast-forward main. Dirty tracked app changes are the tested latest app
  state. Temporary/personal untracked material is not part of that state.
- Historical untracked Overlay plans are excluded because they are not needed
  by the APK and were not reviewed for public release.

## Verification

LotTicket:

1. `python -m unittest discover -s tests -v`
2. `node scripts/secret-patterns.test.mjs`
3. `node scripts/verify.mjs`
4. `node scripts/check-locked.mjs`
5. `node scripts/check-tracked-secrets.mjs`
6. `python -m py_compile lot_ticket.py ticket_sync.py tests/test_ticket_sync.py`
7. Confirm V23 assets are byte-identical to prior V22 blobs and no V22 runtime
   reference remains.

Overlay:

8. `node scripts/verify.mjs`
9. `node scripts/check-locked.mjs`
10. `.\gradlew.bat :app:compileDebugKotlin --rerun-tasks`
11. `.\gradlew.bat :app:testDebugUnitTest --rerun-tasks`

Staged-release safety:

12. Stage only explicit paths; never `git add .`, `git add -A`, or
    `git commit -a`.
13. Run `node scripts/check-staged-secrets.mjs` in both repositories.
14. Inspect cached name-status/stat/check and reject excluded paths or binary
    image/document/archive content.
15. Cold-audit the exact staged release read-only.
16. Commit, recheck fast-forward ancestry, and push explicit `HEAD:main`
    refspecs without force.

## Definition of done

- Both GitHub `main` branches contain the curated release.
- LotTicket is V23; Overlay's commit-derived version increments.
- All gates pass and no excluded/personal/secret material is committed.
- Excluded local material remains untouched.

Approved by primary, 2026-08-27.
