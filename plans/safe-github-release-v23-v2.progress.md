# Safe GitHub release: LotTicket V23 + current Overlay (v2) progress

## Done

- Updated LotTicket's runtime and Web App cache-bust surfaces to
  `PROD_1_V23`: `lot_ticket.py`, `index.html`, and the referenced CSS/JS
  filenames and query tokens.
- Renamed `script_v22.js` to `script_v23.js` and `style_v22.css` to
  `style_v23.css` without changing their bytes.
- Updated current V23 asset/release wording in `CLAUDE.md` and `README.md`.
- Updated `scripts/verify.mjs` to derive its payout-parity source from the
  current `script_vNN.js` reference in `index.html`; payout, schedule,
  anti-tamper, and fail-closed checks remain active.
- Acknowledged the explicitly approved locked version change with
  `node scripts/check-locked.mjs --update`; the snapshot now records
  `PROD_1_V23`.
- Appended exactly these six approved patterns to Overlay `.gitignore`:
  `.tmp-*/`, `artifacts/`, `bank transfer examples/`,
  `hand written lists examples/`, `yappy receipts examples/`, and
  `HANDOFF-*.md`. The pre-existing byte prefix was preserved, including its
  existing malformed NUL-containing line.
- No files were staged, committed, pushed, deployed, cleaned, reverted, or
  deleted. The Overlay worktree's unrelated dirty and excluded material was
  preserved.

### Files edited by this execution

LotTicket:

- `CLAUDE.md`
- `README.md`
- `index.html`
- `lot_ticket.py`
- `script_v22.js` → `script_v23.js`
- `style_v22.css` → `style_v23.css`
- `scripts/locked-snapshot.json`
- `scripts/verify.mjs`

Overlay:

- `.gitignore`

Workflow artifact written at the end of execution:

- `plans/safe-github-release-v23-v2.progress.md`

The already-dirty Bot1/sync files and release plans listed in the approved
plan were retained; they were not rewritten during this execution.

## Not done

- Staging, release commits, fast-forward checks, pushes, GitHub Pages
  deployment, PythonAnywhere restart, and APK delivery were not performed
  because the user explicitly required this worker to leave both worktrees
  uncommitted and undeployed.
- Overlay's final Gradle compile and unit-test commands were attempted but did
  not complete because the pre-existing Gradle/KSP generated-cache state was
  corrupt or daemon-controlled. The exact outcomes are recorded below.
- No live Telegram group/secret/QR or Android-device smoke test was possible.

## Deviations from plan

- The v2 plan was used after the v1 revision request. It explicitly added
  `scripts/verify.mjs`, which was updated with index-derived current-script
  handling rather than retaining an obsolete V22 path.
- Gradle validation required the approved escalated command because the
  sandbox could not access the Gradle 8.5 distribution socket. A
  `gradlew --stop` command was used once to release stale daemons; no project
  cleanup or generated-file deletion was performed.
- Overlay `.gitignore` is reported by Git as a binary diff because its
  pre-existing content contains NUL bytes. A byte-level check confirmed the
  original content is an unchanged prefix and the six approved rules are the
  exact appended suffix.

## Assumptions made during execution

- The first `script_vNN.js` reference matched by the existing verifier regex in
  `index.html` is the canonical current payout/schedule source. The verifier
  still normalizes to the basename for disk lookup, as it did before this
  change.
- The SHA-256 values captured before the rename are the V22 source blobs; equal
  V23 hashes prove the rename was byte-identical.
- Existing dirty files outside the listed release scope belong to the user and
  remain untouched.

## Baseline vs final

LotTicket baseline and final results:

- `python -m unittest discover -s tests -v`: PASS, 9 tests, both runs.
- `node scripts/secret-patterns.test.mjs`: PASS (`secret-patterns: OK`), both
  runs.
- `node scripts/verify.mjs`: PASS (`verify: OK (68 checks)`), both runs.
- `node scripts/check-locked.mjs`: PASS (`check-locked: OK (11 surfaces)`),
  both runs; final snapshot was updated through `--update` before the final
  check.
- `node scripts/check-tracked-secrets.mjs`: PASS (`scanned 38 tracked files,
  no secrets`), both runs.
- `python -m py_compile lot_ticket.py ticket_sync.py tests/test_ticket_sync.py`:
  PASS with no output, both runs.
- `node scripts/check-staged-secrets.mjs`: PASS with no output, both runs.

Overlay baseline and final results:

- `node scripts/verify.mjs`: PASS (`check-locked: OK (locked invariants match
  snapshot)` and `verify: locked invariants OK — compile/tests left to CI`),
  both runs.
- `node scripts/check-locked.mjs`: PASS (`check-locked: OK (locked invariants
  match snapshot)`), both runs.
- `node scripts/check-staged-secrets.mjs`: PASS with no output, both runs.
- `git diff --check`: PASS, with only existing line-ending/global-ignore
  permission warnings, both runs.
- Baseline `.\gradlew.bat :app:compileDebugKotlin --rerun-tasks`: the sandbox
  attempt failed downloading Gradle 8.5 with `SocketException: Permission
  denied: getsockopt`; the escalated retry passed (`BUILD SUCCESSFUL`, 18
  actionable tasks).
- Baseline `.\gradlew.bat :app:testDebugUnitTest --rerun-tasks`: the first
  escalated attempt failed because the Gradle daemon stopped; the retry failed
  at KSP while flushing the pre-existing cache with
  `Unexpected byte value for storeFullFqNames`.
- Final `.\gradlew.bat :app:compileDebugKotlin --rerun-tasks`: failed first on
  a generated `R.jar` file lock, then after `gradlew --stop` failed with
  `Gradle build daemon has been stopped: stop command received`. A no-daemon
  retry also ended with the same daemon-stop result.
- Final `.\gradlew.bat :app:testDebugUnitTest --rerun-tasks`: failed at KSP
  while flushing the same pre-existing cache with
  `Unexpected byte value for storeFullFqNames`.

## Verification results

Additional release checks:

- `node --check script_v23.js`: PASS.
- `node --check scripts/verify.mjs`: PASS.
- V23 `Get-FileHash -Algorithm SHA256`:

  ```text
  script_v23.js  542E97D8E4B108CBBF7D07C4427FE10B3F884B227BA30F3FDE3F94C4868777F1
  style_v23.css  5255D183BAA85A74B9BA8BF7232A64EBF957595D1A491049DB84397E509BA1E1
  ```

  These equal the hashes recorded before the V22→V23 rename.
- `rg` over the live LotTicket surfaces (`index.html`, `lot_ticket.py`, both
  V23 assets, `CLAUDE.md`, `README.md`, and `scripts`) found V23 references and
  no `PROD_1_V22`, `script_v22.js`, or `style_v22.css` runtime reference.
- A Node byte-prefix/suffix check passed:
  `overlay .gitignore: exact approved append`.
- `git diff --cached --name-only` was empty in both repositories; no staged
  snapshot was created by this worker.

### Base-branch diff file lists

The required reviewer command was run in each repository in PowerShell form:
`$base = git merge-base HEAD origin/main; git diff "$base...HEAD" --name-only -- ':!plans/'`.
These lists describe committed base-branch deltas and intentionally do not
include the current uncommitted release edits or any `plans/` artifact.

LotTicket:

```text
.claude/agents/auditor.md
.claude/agents/executor.md
.claude/agents/planner.md
.claude/agents/reviewer.md
.claude/skills/auto-workflow/SKILL.md
CLAUDE.md
```

Overlay:

```text
.claude/agents/auditor.md
.claude/agents/executor.md
.claude/agents/planner.md
.claude/agents/reviewer.md
.claude/skills/auto-workflow/SKILL.md
.codex/agents/luna-worker.toml
.codex/agents/sol-cold-reviewer.toml
AGENTS.md
CLAUDE.md
app/build.gradle.kts
app/src/main/AndroidManifest.xml
app/src/main/java/com/yappy/overlay/YappyApp.kt
app/src/main/java/com/yappy/overlay/data/AppDatabase.kt
app/src/main/java/com/yappy/overlay/data/AppDatabaseMigrations.kt
app/src/main/java/com/yappy/overlay/data/PendingSyncEventDao.kt
app/src/main/java/com/yappy/overlay/data/PendingSyncEventEntity.kt
app/src/main/java/com/yappy/overlay/data/PrefsManager.kt
app/src/main/java/com/yappy/overlay/data/SeenBankCodigoDao.kt
app/src/main/java/com/yappy/overlay/data/SeenBankCodigoEntity.kt
app/src/main/java/com/yappy/overlay/data/TicketDao.kt
app/src/main/java/com/yappy/overlay/overlay/AGENTS.md
app/src/main/java/com/yappy/overlay/overlay/BotFeedbackBannerOverlayManager.kt
app/src/main/java/com/yappy/overlay/overlay/CLAUDE.md
app/src/main/java/com/yappy/overlay/overlay/GrabCardOverlayManager.kt
app/src/main/java/com/yappy/overlay/overlay/OverlayAction.kt
app/src/main/java/com/yappy/overlay/overlay/OverlayTicketsHistoryWindowManager.kt
app/src/main/java/com/yappy/overlay/overlay/OverlayWindowManager.kt
app/src/main/java/com/yappy/overlay/overlay/PreDrawBubbleClear.kt
app/src/main/java/com/yappy/overlay/parser/AGENTS.md
app/src/main/java/com/yappy/overlay/parser/BankReceiptParser.kt
app/src/main/java/com/yappy/overlay/parser/CLAUDE.md
app/src/main/java/com/yappy/overlay/parser/DrawTimeRecognition.kt
app/src/main/java/com/yappy/overlay/parser/HandwrittenListOcr.kt
app/src/main/java/com/yappy/overlay/parser/ListGrabAnalysis.kt
app/src/main/java/com/yappy/overlay/parser/LocalYappyReceiptParser.kt
app/src/main/java/com/yappy/overlay/parser/MessageParser.kt
app/src/main/java/com/yappy/overlay/parser/TicketListParser.kt
app/src/main/java/com/yappy/overlay/parser/TicketTranscriptEnvelope.kt
app/src/main/java/com/yappy/overlay/service/AGENTS.md
app/src/main/java/com/yappy/overlay/service/BankReceiptArchiveCoordinator.kt
app/src/main/java/com/yappy/overlay/service/BankTransferBubbleMatcher.kt
app/src/main/java/com/yappy/overlay/service/CLAUDE.md
app/src/main/java/com/yappy/overlay/service/GeminiListOcr.kt
app/src/main/java/com/yappy/overlay/service/GrabDirectLaunchCoordinator.kt
app/src/main/java/com/yappy/overlay/service/GrabSelectionSweep.kt
app/src/main/java/com/yappy/overlay/service/GrabbedMessageLedger.kt
app/src/main/java/com/yappy/overlay/service/HandwrittenCaptureEnhancer.kt
app/src/main/java/com/yappy/overlay/service/LocalBankReceiptVerifier.kt
app/src/main/java/com/yappy/overlay/service/LocalReceiptOcrEngine.kt
app/src/main/java/com/yappy/overlay/service/LocalYappyReceiptVerifier.kt
app/src/main/java/com/yappy/overlay/service/OverlayService.kt
app/src/main/java/com/yappy/overlay/service/ScreenCaptureService.kt
app/src/main/java/com/yappy/overlay/service/ScreenCaptureSessionCoordinator.kt
app/src/main/java/com/yappy/overlay/service/ScreenshotListGrabCoordinator.kt
app/src/main/java/com/yappy/overlay/service/WhatsAppCaptureStructure.kt
app/src/main/java/com/yappy/overlay/service/WhatsAppGrabService.kt
app/src/main/java/com/yappy/overlay/sync/AGENTS.md
app/src/main/java/com/yappy/overlay/sync/CLAUDE.md
app/src/main/java/com/yappy/overlay/sync/ConfirmEmojiRegistry.kt
app/src/main/java/com/yappy/overlay/sync/PaymentConfirmationRegistry.kt
app/src/main/java/com/yappy/overlay/sync/PendingSyncQueue.kt
app/src/main/java/com/yappy/overlay/sync/ReactionSyncer.kt
app/src/main/java/com/yappy/overlay/sync/TicketSyncBootstrap.kt
app/src/main/java/com/yappy/overlay/sync/TicketSyncDispatcher.kt
app/src/main/java/com/yappy/overlay/sync/TicketSyncMessages.kt
app/src/main/java/com/yappy/overlay/sync/TicketSyncPublisher.kt
app/src/main/java/com/yappy/overlay/sync/TicketSyncReceiver.kt
app/src/main/java/com/yappy/overlay/tdlib/TdLibManager.kt
app/src/main/java/com/yappy/overlay/tdlib/TdLibMessageSendTracker.kt
app/src/main/java/com/yappy/overlay/ticket/AGENTS.md
app/src/main/java/com/yappy/overlay/ticket/AwardsCalculator.kt
app/src/main/java/com/yappy/overlay/ticket/CLAUDE.md
app/src/main/java/com/yappy/overlay/ticket/DrawIntentResolver.kt
app/src/main/java/com/yappy/overlay/ticket/TicketCardView.kt
app/src/main/java/com/yappy/overlay/ticket/TicketGalleryWriter.kt
app/src/main/java/com/yappy/overlay/ticket/TicketIdGenerator.kt
app/src/main/java/com/yappy/overlay/ticket/TicketImageRenderer.kt
app/src/main/java/com/yappy/overlay/ticket/TicketItemsCodec.kt
app/src/main/java/com/yappy/overlay/ticket/TicketSecurityPattern.kt
app/src/main/java/com/yappy/overlay/ui/AGENTS.md
app/src/main/java/com/yappy/overlay/ui/DividerTextEditing.kt
app/src/main/java/com/yappy/overlay/ui/SettingsFragment.kt
app/src/main/java/com/yappy/overlay/ui/TicketCalculatorController.kt
app/src/main/java/com/yappy/overlay/ui/TicketCalculatorLaunchContext.kt
app/src/main/java/com/yappy/overlay/ui/TicketCalculatorViewBinder.kt
app/src/main/java/com/yappy/overlay/ui/TicketPreviewAdapter.kt
app/src/main/res/drawable/bg_grab_panel.xml
app/src/main/res/layout/fragment_settings.xml
app/src/main/res/layout/overlay_bot_feedback_banner.xml
app/src/main/res/layout/overlay_grab_card.xml
app/src/main/res/layout/view_ticket_calculator_content.xml
app/src/main/res/values-es/bank_receipt_strings.xml
app/src/main/res/values-es/local_yappy_ocr_strings.xml
app/src/main/res/values-es/strings.xml
app/src/main/res/values/bank_receipt_strings.xml
app/src/main/res/values/local_yappy_ocr_strings.xml
app/src/main/res/values/strings.xml
app/src/main/res/xml/whatsapp_grab_accessibility.xml
scripts/locked-snapshot.json
scripts/secret-patterns.mjs
scripts/secret-patterns.test.mjs
```

## Remaining risks

- Overlay Gradle's KSP lookup cache remains corrupt in this checkout, so the
  final compile/test gates require a later rerun after the environment/cache
  issue is resolved; no passing Gradle result is claimed here.
- The release still requires the primary to curate explicit paths, run staged
  secret/binary/exclusion inspection, create non-force fast-forward commits,
  and push only after independent verification.
- Runtime Telegram permissions, shared-secret parity, QR scanning, and
  post-deployment behavior still require an operational smoke test.
