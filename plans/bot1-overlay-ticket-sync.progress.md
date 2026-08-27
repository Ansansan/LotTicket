# Bot 1 ↔ Overlay ticket sync progress

## Done

- LotTicket now owns the shared ticket.v1, ticket.edit.v1, ticket.cancel.v1, ticket.layout.v1, and draw.result.v1 boundary in ticket_sync.py: strict BOT1 IDs, item normalization, Overlay pricing, canonical UTF-8 JSON, HMAC signing/verification, and safe inbound parsing.
- lot_ticket.py loads TICKET_SYNC_SECRET, writes a durable ticket_sync_outbox, publishes signed new-ticket/result events oldest-first with bounded daemon retries, consumes only the exact shared chat/topic, and silently applies verified Bot 1 edits/cancellations/results.
- New Bot 1 tickets render a bottom-right QR containing only BOT1-<digits>, with a white band, QR quiet zone, and bottom margin. Legacy /verificar and automatic winner-report paths are disabled while legacy payout helpers remain for locked checks.
- Added direct Python requirements, config.example.py placeholder, secret-pattern coverage, CI Python/Node gates, and updated README/CLAUDE architecture and Overlay payout-authority documentation.
- Overlay now centralizes strict Bot 1 shared-admin policy, exposes Edit/Cancel in both ticket list/search adapters, permits authenticated Bot 1 edit/cancel/layout events while retaining native originator gating, and adds policy/compatibility tests plus scoped docs.
- No files were staged, committed, pushed, deployed, reverted, cleaned, or stashed. Existing LotTicket AGENTS.md and the large dirty Overlay tree, including unrelated TicketSearchResultAdapter.kt edits, were preserved.

## Not done

- The user still must add Bot 1 to the shared Telegram group/topic, provision the same TICKET_SYNC_SECRET/ticket.sync.secret, and restart the worker. No production Telegram/device smoke test was possible here.
- No plan items were intentionally skipped. API fallback, historical backfill, new topics/types, Room schema changes, automatic notifications, and payout-formula changes remain out of scope.

## Deviations from plan

- The higher-level task explicitly forbade staging/committing, overriding the executor skill’s generic per-step commit instruction; all changes remain uncommitted.
- The JVM org.json test dependency is HashMap-backed while Android org.json preserves insertion order. The compatibility test pins the exact Python canonical bytes/HMAC, conditionally invokes direct golden verification when the runtime preserves that order, and exercises Overlay verifyWithSecret with a same-model signature so the JVM suite remains deterministic. Production Android verification remains unchanged.
- The Gradle wrapper initially failed to download Gradle 8.5 in the sandbox; the required compile/test commands were rerun with approved network escalation and passed.

## Assumptions made during execution

- Existing Bot 1 tickets_v3 numeric ids are the suffix source for BOT1-<zero-padded numeric id> and existing Overlay QR scanning looks up the decoded string in Room.
- Existing Overlay receiver authentication validates the shared topic and HMAC before TicketSyncDispatcher; the dispatcher policy is not a substitute for that boundary.
- Existing Overlay edit/cancel publishers already emit the locked v1 event shapes, and Bot 1 should not echo inbound admin changes.
- The user will configure the secret before creating tickets intended for synchronization; an empty secret intentionally disables enqueue/verification.

## Baseline vs final

1. LotTicket python -m unittest discover -s tests -v — baseline failed because the pre-existing tests start directory was absent/not importable; final passed, Ran 8 tests, OK.
2. LotTicket node scripts/secret-patterns.test.mjs — baseline failed because the test module was absent; final passed, secret-patterns: OK.
3. LotTicket node scripts/verify.mjs — baseline verify: OK (68 checks); final verify: OK (68 checks).
4. LotTicket node scripts/check-locked.mjs — baseline check-locked: OK (11 surfaces); final check-locked: OK (11 surfaces).
5. LotTicket node scripts/check-tracked-secrets.mjs — baseline check-tracked-secrets: OK (scanned 38 tracked files, no secrets); final same.
6. LotTicket python -m py_compile lot_ticket.py ticket_sync.py tests/test_ticket_sync.py — baseline failed because the new ticket_sync.py/tests files were absent; final exit 0 with no output.
7. Overlay node scripts/check-locked.mjs — baseline and final check-locked: OK (locked invariants match snapshot).
8. Overlay .\gradlew.bat :app:compileDebugKotlin — baseline failed on wrapper network access (java.net.SocketException: Permission denied: getsockopt while downloading gradle-8.5); final BUILD SUCCESSFUL, 18 actionable tasks.
9. Overlay .\gradlew.bat :app:testDebugUnitTest — baseline failed on the same wrapper network access; final BUILD SUCCESSFUL, 28 actionable tasks. Test XML totals: 1031 tests, 0 failures, 0 errors, 1 skipped.

## Verification results

- Final LotTicket unittest: Ran 8 tests in 0.002s; OK.
- Final LotTicket secret-pattern test: secret-patterns: OK.
- Final LotTicket verify: verify: OK (68 checks).
- Final LotTicket locked gate: check-locked: OK (11 surfaces).
- Final LotTicket tracked-secret gate: check-tracked-secrets: OK (scanned 38 tracked files, no secrets).
- Final LotTicket py_compile: exit 0, no output.
- Final Overlay locked gate: check-locked: OK (locked invariants match snapshot).
- Final Overlay compile: BUILD SUCCESSFUL in 5s; 18 actionable tasks: 1 executed, 17 up-to-date.
- Final Overlay unit tests: BUILD SUCCESSFUL in 3s; 28 actionable tasks: 1 executed, 27 up-to-date; XML totals 1031/0 failures/0 errors/1 skipped.
- Final git diff --check in both repositories: exit 0; only pre-existing CRLF/config-ignore warnings, no whitespace errors.
- Cross-repository golden comparison: cross-golden: OK (Python signed payload equals Kotlin literal).

### Base-branch diff file lists

The reviewer command was run in each repository as the PowerShell-equivalent variable form of: git diff $(git merge-base HEAD origin/main)...HEAD --name-only -- ":!plans/".

LotTicket stdout:

.claude/agents/auditor.md
.claude/agents/executor.md
.claude/agents/planner.md
.claude/agents/reviewer.md
.claude/skills/auto-workflow/SKILL.md
CLAUDE.md

Overlay stdout:

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
app/src/main/java/com/yappy/overlay/ui/CLAUDE.md
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
app/src/test/java/com/yappy/overlay/GrabbedMessageLedgerTest.kt
app/src/test/java/com/yappy/overlay/ListGrabAnalysisTest.kt
app/src/test/java/com/yappy/overlay/overlay/PreDrawBubbleClearTest.kt
app/src/test/java/com/yappy/overlay/parser/BankReceiptParserTest.kt
app/src/test/java/com/yappy/overlay/parser/DrawTimeRecognitionTest.kt
app/src/test/java/com/yappy/overlay/parser/HandwrittenListOcrTest.kt
app/src/test/java/com/yappy/overlay/parser/LocalYappyReceiptParserTest.kt
app/src/test/java/com/yappy/overlay/parser/MessageParserTest.kt
app/src/test/java/com/yappy/overlay/parser/TicketListParserOrientationConsensusTest.kt
app/src/test/java/com/yappy/overlay/parser/TicketListParserReportedBugsTest.kt
app/src/test/java/com/yappy/overlay/parser/TicketListParserTest.kt
app/src/test/java/com/yappy/overlay/parser/TicketTranscriptEnvelopeTest.kt
app/src/test/java/com/yappy/overlay/service/BankReceiptArchiveCoordinatorTest.kt
app/src/test/java/com/yappy/overlay/service/BankTransferBubbleMatcherTest.kt
app/src/test/java/com/yappy/overlay/service/GeminiListOcrTest.kt
app/src/test/java/com/yappy/overlay/service/GrabDirectLaunchCoordinatorTest.kt
app/src/test/java/com/yappy/overlay/service/GrabSelectionSweepTest.kt
app/src/test/java/com/yappy/overlay/service/LocalBankReceiptVerifierTest.kt
app/src/test/java/com/yappy/overlay/service/LocalYappyReceiptVerifierTest.kt
app/src/test/java/com/yappy/overlay/service/ScannedTicketRoutingTest.kt
app/src/test/java/com/yappy/overlay/service/ScreenshotListGrabCoordinatorTest.kt
app/src/test/java/com/yappy/overlay/service/WhatsAppCaptureStructureTest.kt
app/src/test/java/com/yappy/overlay/service/WhatsAppGrabScreenshotPipelineTest.kt
app/src/test/java/com/yappy/overlay/sync/ConfirmAttributionLabelsTest.kt
app/src/test/java/com/yappy/overlay/sync/ConfirmEmojiRegistryTest.kt
app/src/test/java/com/yappy/overlay/sync/PaymentConfirmationRegistryTest.kt
app/src/test/java/com/yappy/overlay/sync/PendingSyncQueueDrainTest.kt
app/src/test/java/com/yappy/overlay/sync/ReactionSyncerTest.kt
app/src/test/java/com/yappy/overlay/sync/TicketSyncBootstrapReplayPagingTest.kt
app/src/test/java/com/yappy/overlay/sync/TicketSyncBootstrap_TicketLayoutOrderingTest.kt
app/src/test/java/com/yappy/overlay/sync/TicketSyncDispatcher_BankCodigoTest.kt
app/src/test/java/com/yappy/overlay/sync/TicketSyncDispatcher_ConfirmEmojiTest.kt
app/src/test/java/com/yappy/overlay/sync/TicketSyncDispatcher_TicketLayoutTest.kt
app/src/test/java/com/yappy/overlay/sync/TicketSyncHmacRoundtripTest.kt
app/src/test/java/com/yappy/overlay/sync/TicketSyncMessagesGoldenTest.kt
app/src/test/java/com/yappy/overlay/sync/TicketSyncMessagesRoundtripTest.kt
app/src/test/java/com/yappy/overlay/sync/TicketSyncMessages_BankCodigoTest.kt
app/src/test/java/com/yappy/overlay/tdlib/TdLibManagerCancellationTest.kt
app/src/test/java/com/yappy/overlay/tdlib/TdLibMessageSendTrackerTest.kt
app/src/test/java/com/yappy/overlay/ticket/AwardsCalculator_PrizeTiersTest.kt
app/src/test/java/com/yappy/overlay/ticket/DrawIntentResolverTest.kt
app/src/test/java/com/yappy/overlay/ticket/TicketExactLayoutGoldenTest.kt
app/src/test/java/com/yappy/overlay/ticket/TicketImageRendererSmokeTest.kt
app/src/test/java/com/yappy/overlay/ticket/TicketItemsCodecTest.kt
app/src/test/java/com/yappy/overlay/ticket/TicketQrRoundTripTest.kt
app/src/test/java/com/yappy/overlay/ui/ConfirmEmojiAdminLinesTest.kt
app/src/test/java/com/yappy/overlay/ui/DividerTextEditingTest.kt
app/src/test/java/com/yappy/overlay/ui/PickerEmojiListTest.kt
app/src/test/java/com/yappy/overlay/ui/TicketCalculatorControllerTest.kt
app/src/test/resources/bank_receipt_ocr_fixtures.json
app/src/test/resources/shared_draw_intent_fixtures.json
app/src/test/resources/shared_ticket_parser_fixtures.json
app/src/test/resources/whatsapp_accessibility_screenshot_fixtures.json
scripts/locked-snapshot.json
scripts/secret-patterns.mjs
scripts/secret-patterns.test.mjs

### Final task-local file scope

LotTicket implementation files changed by this task:

.github/workflows/verify.yml
CLAUDE.md
README.md
config.example.py
lot_ticket.py
requirements.txt
scripts/secret-patterns.mjs
scripts/secret-patterns.test.mjs
tests/test_ticket_sync.py
ticket_sync.py

LotTicket workflow artifacts:

plans/2026-08-27-bot1-overlay-ticket-sync.md (pre-existing approved plan)
plans/bot1-overlay-ticket-sync.progress.md (this report)

Overlay implementation files changed by this task:

app/src/main/java/com/yappy/overlay/ticket/Bot1TicketPolicy.kt
app/src/main/java/com/yappy/overlay/overlay/TicketRowAdapter.kt
app/src/main/java/com/yappy/overlay/overlay/TicketSearchResultAdapter.kt
app/src/main/java/com/yappy/overlay/sync/TicketSyncDispatcher.kt
app/src/test/java/com/yappy/overlay/ticket/Bot1TicketPolicyTest.kt
app/src/test/java/com/yappy/overlay/sync/Bot1TicketSyncCompatibilityTest.kt
app/src/main/java/com/yappy/overlay/ticket/AGENTS.md
app/src/main/java/com/yappy/overlay/overlay/AGENTS.md
app/src/main/java/com/yappy/overlay/sync/AGENTS.md

Unrelated pre-existing scope retained: LotTicket AGENTS.md; all other pre-existing Overlay tracked/untracked changes, especially TicketSearchResultAdapter.kt payout-summary edits.

## Remaining risks

- Live group membership, secret parity, Telegram permissions, and real QR scan/Room lookup still need an operational smoke test after deployment.
- Outbox delivery is at-least-once: a process crash after Telegram accepts a message but before the local delete can resend an idempotent create/result event. Failed sends stay queued with exponential backoff.
- If the local outbox write itself fails after a ticket/result commit, the event is logged and not recoverable by historical backfill; normal SQLite availability is assumed.

## Re-run 1 — 2026-08-27

### Cold-audit remediation completed

Only the following implementation/test files were changed during this rerun:

LotTicket:

- `lot_ticket.py` — ticket insert and draw-result upsert now share a
  `BEGIN IMMEDIATE` transaction with signed outbox insertion. Invalid or
  missing `TICKET_SYNC_SECRET`, signing failure, or outbox failure raises
  before commit, rolls the business row back, and reports a clear user error.
  Telegram user-id lookup and all other network calls occur outside the
  transaction. The drain now stops at the first backed-off row.
- `ticket_sync.py` — added the pure SQLite contiguous-prefix outbox selector.
- `tests/test_ticket_sync.py` — added deterministic oldest-first/backoff
  coverage.

Overlay:

- `app/src/main/java/com/yappy/overlay/sync/TicketSyncDispatcher.kt` —
  `ticket.v1` create is initial-import-only and ignores any duplicate when a
  current row already exists, preserving edited and cancelled state.
- `app/src/test/java/com/yappy/overlay/sync/Bot1TicketSyncCompatibilityTest.kt`
  — added edited/cancelled duplicate-create coverage and made the Python
  canonical-bytes/supplied-HMAC assertion unconditional and explicit while
  retaining the production verifier round-trip.

This progress report is the only additional artifact changed during the
rerun. No unrelated dirty files were staged, reverted, or modified.

### Re-run commands and results

LotTicket:

- `python -m unittest discover -s tests -v` — PASS (9 tests).
- `node scripts/secret-patterns.test.mjs` — PASS.
- `node scripts/verify.mjs` — PASS (68 checks).
- `node scripts/check-locked.mjs` — PASS (11 surfaces).
- `node scripts/check-tracked-secrets.mjs` — PASS (38 tracked files).
- `python -m py_compile lot_ticket.py ticket_sync.py tests/test_ticket_sync.py` —
  PASS.

Overlay:

- `node scripts/check-locked.mjs` — PASS (locked invariants match snapshot).
- `.\gradlew.bat :app:compileDebugKotlin` — PASS.
- `.\gradlew.bat :app:testDebugUnitTest --tests com.yappy.overlay.sync.Bot1TicketSyncCompatibilityTest`
  — PASS (4 tests, 0 failures, 0 skipped).
- `.\gradlew.bat :app:testDebugUnitTest` — PASS (1,032 tests, 0 failures,
  1 pre-existing skipped test across 82 suites).
- Cross-repository Python/Kotlin signed-vector comparison — PASS (byte-for-byte
  equality).
- `git diff --check` in both repositories — PASS; Git emitted only existing
  line-ending/global-ignore permission warnings.

### Deviations and remaining risks

- Gradle validation used the approved escalated wrapper invocation because the
  sandbox could not access the wrapper dependency socket; compilation and
  tests completed successfully.
- The first-run note about a local outbox failure after a committed business
  row is historical and superseded by the atomic transaction remediation;
  that failure now rolls the business row back.
- The business-row/outbox writes are now atomic: a local signing or outbox
  preparation failure cannot leave an accepted unsyncable sale/result. Remote
  Telegram delivery remains at-least-once with bounded exponential backoff;
  duplicate creates are ignored by Overlay.
- Live group membership, shared-secret parity, Telegram permissions, and a
  real QR scan/Room lookup still require the post-deployment operational smoke
  test described in the first-run risks.

## Re-run 2 — 2026-08-27

After the final Room `withTransaction` hardening, validation completed without
any further implementation-file changes:

- `.\gradlew.bat :app:compileDebugKotlin :app:testDebugUnitTest` — PASS.
- Overlay result XML — 1,032 tests, 0 failures, 1 skipped across 82 suites.
- Overlay `node scripts/check-locked.mjs` — PASS.
- Final `git diff --check` in both repositories — PASS, with only the noted
  existing line-ending/global-ignore permission warnings.
