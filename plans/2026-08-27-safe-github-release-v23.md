# Safe GitHub release: LotTicket V23 + current Overlay

Date: 2026-08-27
Slug: `safe-github-release-v23`

## Context

The user explicitly authorized publishing both repositories to GitHub `main`,
requested an incremented release version, and required that images, receipts,
personal data, temporary material, local configuration, and secrets be
excluded. LotTicket is one commit ahead of `origin/main` plus the completed
Bot1/Overlay sync work. Overlay is 358 commits ahead of `origin/main` and has a
large tested dirty working tree containing intentional application changes as
well as unsafe/local-only material.

## Summary

- Publish LotTicket as `PROD_1_V23`, preserving the completed Bot1 QR/sync
  implementation and the prior Codex workflow update.
- Publish Overlay's current intentional application source state and the Bot1
  integration. Overlay versioning remains Git-derived; the release commit
  increments `versionCode`/`versionName` automatically.
- Curate the Overlay release explicitly. Never bulk-stage the repository.
- Exclude local/personal/generated content and add ignore rules for the
  high-risk image/temp directories.
- Verify the exact staged snapshots, then fast-forward both `main` branches.

## Key Changes (exhaustive release scope)

### LotTicket repository

1. Version/cache-bust surfaces:
   - `lot_ticket.py`: `BOT_VERSION` becomes `PROD_1_V23` while retaining the
     completed Bot1 ticket-sync implementation.
   - `index.html`: `CURRENT_VERSION`, CSS/JS filenames, and query tokens become
     V23.
   - Rename `script_v22.js` to `script_v23.js` without content changes.
   - Rename `style_v22.css` to `style_v23.css` without content changes.
   - `CLAUDE.md` and `README.md`: update literal current-asset/release wording
     to V23 without changing product rules.
   - `scripts/locked-snapshot.json`: acknowledge the explicitly approved V23
     version change using `node scripts/check-locked.mjs --update`.
2. Release the already completed and verified ticket-sync/workflow files:
   `.github/workflows/verify.yml`, `AGENTS.md`, `CLAUDE.md`, `README.md`,
   `config.example.py`, `lot_ticket.py`, `requirements.txt`,
   `ticket_sync.py`, `tests/test_ticket_sync.py`,
   `scripts/secret-patterns.mjs`, `scripts/secret-patterns.test.mjs`,
   `plans/2026-08-27-bot1-overlay-ticket-sync.md`, and
   `plans/bot1-overlay-ticket-sync.progress.md`.
3. Add this plan and `plans/safe-github-release-v23.progress.md`.

### Overlay repository

4. `.gitignore`: ignore `.tmp-*/`, `artifacts/`, `bank transfer examples/`,
   `hand written lists examples/`, `yappy receipts examples/`, and local
   `HANDOFF-*.md` files.
5. Release all currently modified/deleted **tracked** files shown by the
   pre-release `git status`, including root/scoped `AGENTS.md`, the existing
   `.codex/agents/sol-cold-reviewer.toml`, Android source/resources/tests, and
   the intended removal of obsolete Grab-card files. These are part of the
   current tested application state.
6. Release only these safe untracked categories:
   - `.codex/config.toml`, `.codex/hooks.json`, `.codex/agents/planner.toml`;
   - new `app/src/main/java/com/yappy/overlay/**` Kotlin sources;
   - new `app/src/main/res/**` XML resources;
   - new `app/src/test/java/com/yappy/overlay/**` Kotlin tests.
7. Release the completed Bot1-specific Overlay files within those categories:
   `Bot1TicketPolicy.kt`, `Bot1TicketPolicyTest.kt`,
   `Bot1TicketSyncCompatibilityTest.kt`, adapter policy changes, dispatcher
   idempotency/authorization changes, and scoped `AGENTS.md` updates.
8. Do **not** manually edit `app/build.gradle.kts` version fields. The existing
   commit-count derivation increments the APK version when the curated release
   commit is created.

## Explicit exclusions

- Every `.tmp-*` directory.
- `artifacts/` and all screenshots/XML device captures.
- `bank transfer examples/`, `hand written lists examples/`, and
  `yappy receipts examples/`.
- `HANDOFF-2026-08-26-tasks.md` and other local handoff artifacts.
- Untracked historical `plans/**` in Overlay (not required by the APK and not
  reviewed for publication in this release).
- `local.properties`, `google-services.json`, keystores, APK/AAB/build output,
  credentials, secrets, and ignored local caches.
- Force-push, history rewrite, deployment to PythonAnywhere, or APK delivery.

## Verification

### LotTicket

1. `python -m unittest discover -s tests -v`
2. `node scripts/secret-patterns.test.mjs`
3. `node scripts/verify.mjs`
4. `node scripts/check-locked.mjs`
5. `node scripts/check-tracked-secrets.mjs`
6. `python -m py_compile lot_ticket.py ticket_sync.py tests/test_ticket_sync.py`
7. Confirm V23 asset renames are byte-identical to the former V22 assets and
   no V22 runtime reference remains.

### Overlay

8. `node scripts/verify.mjs`
9. `node scripts/check-locked.mjs`
10. `.\gradlew.bat :app:compileDebugKotlin --rerun-tasks`
11. `.\gradlew.bat :app:testDebugUnitTest --rerun-tasks`

### Exact staged-release safety

12. Stage only the explicit release scope with path-specific `git add`/
    `git rm`; never `git add .`, `git add -A`, or `git commit -a`.
13. Run each repository's `node scripts/check-staged-secrets.mjs`.
14. Inspect `git diff --cached --name-status`, `--stat`, and `--check`.
15. Assert no staged path matches the explicit exclusions and no staged binary
    image/document/archive is present.
16. Create release commits, confirm both pushes are fast-forward updates of
    `origin/main`, and push explicit `HEAD:main` refspecs without force.

## Locked-invariant approval

The user's explicit request for an incremented LotTicket release version
approves changing the pinned V22 version surface to V23. Run
`node scripts/check-locked.mjs --update` in the same change. Overlay's locked
Git-derived version mechanism remains unchanged.

## Definition of done

- GitHub `main` for both repositories contains the curated release.
- LotTicket reports `PROD_1_V23`; Overlay's commit-derived APK version is
  incremented.
- All required gates pass against the release content.
- No personal images, receipts, temp trees, local secrets/configuration,
  artifacts, or excluded historical plans are committed.
- No force-push occurs and unrelated excluded working-tree material remains
  local and untouched.

Approved by primary, 2026-08-27.
