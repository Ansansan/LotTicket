# Bot 1 tickets in Overlay via QR + Telegram sync

Date: 2026-08-27
Slug: `bot1-overlay-ticket-sync`

## Scoped request

For every Bot 1 ticket created after deployment, render a QR code that the
Overlay app can scan and publish the ticket's machine-readable content to the
Overlay app's existing Telegram ticket-sync topic. Do not backfill old tickets
and do not add an API fallback. Every Overlay admin may edit and cancel these
Bot 1 tickets. Those actions silently update Bot 1's SQLite data; neither an
edited image nor a cancellation/customer/admin notification is sent
automatically. Overlay's payout logic is authoritative, so Bot 1's automatic
winner/payout report and its manual payout command are disabled.

The user will add Bot 1 to the sync group/topic and configure the shared secret
after the code is complete. Known Overlay constants are chat
`-1003595738966`, ticket topic `17925`.

## Design

- Reuse Overlay's locked `ticket.v1`, `ticket.edit.v1`,
  `ticket.cancel.v1`, `ticket.layout.v1`, and `draw.result.v1` formats. No new
  sync event type, topic, Room column, or API endpoint.
- Bot 1 IDs use the reserved namespace `BOT1-<zero-padded numeric id>`. The QR
  contains only that ID. The existing Overlay QR decoder continues to do a
  local Room lookup.
- Bot 1 publishes HMAC-SHA-256 signed canonical JSON to the existing ticket
  topic. A SQLite outbox persists unsent payloads and a bounded background
  drain retries them, so deploying before group membership does not lose new
  ticket events.
- Bot 1 consumes signed Overlay edit/cancel/result events from that same topic.
  It applies only `BOT1-*` edits/cancellations, reconstructing Bot 1's
  `totalLine` at the canonical `$0.25` chance / `$1.00` four-digit prices.
  Incoming changes are silent and are not echoed by the bot.
- Overlay treats a syntactically valid `BOT1-*` ID as admin-owned for UI
  edit/cancel visibility and for the dispatcher originator gate, including the
  supplementary layout event. The private sync topic plus valid HMAC is the
  authorization boundary for these shared-admin tickets.
- Bot 1 result entry still stores and announces official numbers, but publishes
  `draw.result.v1` and does not calculate/send a winner report. Results entered
  from Overlay silently update Bot 1's `draw_results` table.
- Bot 1's `/verificar` command no longer runs its old payout engine; it directs
  admins to Overlay. The old constants/functions remain untouched where the
  repository's locked verification requires them, but no live automatic/admin
  path invokes them.

## Key Changes (exhaustive)

### LotTicket repository

1. `ticket_sync.py` (new)
   - Own the reserved ID parser/formatter, canonical JSON construction,
     HMAC signing/verification, item normalization/pricing, and recognized
     inbound event parsing without importing or starting the Telegram bot.
   - Match Android `org.json` canonical bytes exactly, including insertion
     order, compact separators, UTF-8, HMAC as the final key, and integral
     totals serialized without `.0`.
2. `lot_ticket.py`
   - Load `TICKET_SYNC_SECRET` from `config.py`; add the tracked sync chat/topic
     constants.
   - Create a durable `ticket_sync_outbox` table; enqueue signed create/result
     events and drain oldest-first with safe retry from a daemon loop.
   - Publish `ticket.v1` after every new Bot 1 ticket DB commit; no historical
     scan/backfill.
   - Add a text handler restricted to the exact sync chat/topic. Verify HMAC,
     then silently apply Bot 1 edit/cancel events and all draw-result events.
     Ignore malformed, unsigned, foreign-ID, and bot-irrelevant event types.
   - Render a robust bottom-right QR in its own band using `qrcode`, encoding
     the namespaced ID and expanding the final crop to include its quiet zone
     and bottom margin.
   - Disable the `/verificar` payout calculation and remove the automatic
     `calculate_and_report` call while retaining result storage/announcement.
3. `config.example.py`
   - Add the safe `TICKET_SYNC_SECRET = "REPLACE_ME"` placeholder.
4. `requirements.txt` (new)
   - Declare the bot's direct Python dependencies, including QR generation.
5. `tests/test_ticket_sync.py` (new)
   - Pin ID rules, canonical `ticket.v1`/edit/cancel/result JSON, HMAC golden
     vectors, verification failures, pricing reconstruction, and foreign ID
     rejection using only the Python standard library.
6. `scripts/secret-patterns.mjs`
   - Treat a real `TICKET_SYNC_SECRET` assignment as credential content while
     preserving `REPLACE_ME` as the allowed tracked placeholder.
7. `scripts/secret-patterns.test.mjs` (new)
   - Pin acceptance of the placeholder and rejection of a real sync-secret
     assignment.
8. `.github/workflows/verify.yml`
   - Run the Node secret-pattern test and Python unit tests in CI in addition
     to the existing gates.
9. `README.md`
   - Document dependency installation, the shared secret, Bot 1 group/topic
     membership, and restart procedure. State that no web asset/version bump is
     required for this bot-only rendering/sync release.
10. `CLAUDE.md`
    - Document the QR/sync architecture, new secret, outbox, new-ticket-only
      behavior, silent inbound edit/cancel handling, and Overlay payout
      authority.
11. `plans/2026-08-27-bot1-overlay-ticket-sync.md` and
    `plans/bot1-overlay-ticket-sync.progress.md`.

### Overlay Floating Telegram Reader repository

12. `app/src/main/java/com/yappy/overlay/ticket/Bot1TicketPolicy.kt` (new)
    - Centralize strict `BOT1-<digits>` recognition and the shared-admin
      modification rule.
13. `app/src/main/java/com/yappy/overlay/overlay/TicketRowAdapter.kt`
    - Use the centralized policy so every admin sees Edit/Cancel for Bot 1
      rows while native tickets remain originator-only.
14. `app/src/main/java/com/yappy/overlay/overlay/TicketSearchResultAdapter.kt`
    - Apply the same rule on QR/search-expanded rows, preserving all unrelated
      existing working-tree edits in this already-dirty file.
15. `app/src/main/java/com/yappy/overlay/sync/TicketSyncDispatcher.kt`
    - Permit authenticated Bot 1 edit/cancel/layout events from any sync-topic
      sender while retaining the native-ticket originator gate unchanged.
16. `app/src/test/java/com/yappy/overlay/ticket/Bot1TicketPolicyTest.kt` (new)
    - Pin strict namespace matching and native-vs-Bot1 modification behavior.
17. `app/src/test/java/com/yappy/overlay/sync/Bot1TicketSyncCompatibilityTest.kt`
    (new)
    - Verify a Python-produced signed `ticket.v1` golden payload parses and
      verifies with Overlay, and pin Bot 1 layout/originator-gate behavior.
18. `app/src/main/java/com/yappy/overlay/ticket/AGENTS.md`,
    `app/src/main/java/com/yappy/overlay/overlay/AGENTS.md`, and
    `app/src/main/java/com/yappy/overlay/sync/AGENTS.md`
    - Document the reserved namespace, shared-admin UI policy, and dispatcher
      exception without duplicating unrelated subsystem rules.

## Explicitly out of scope

- API lookup/fallback or a self-contained ticket QR payload.
- Historical ticket backfill.
- A new Telegram topic or new sync wire type/version.
- Room schema/migration or SharedPreferences changes.
- Automatic edited-ticket/cancellation delivery to customers or admin sales
  topics.
- Bot 2 (`dadan/`) and the separate History/Stats API source.
- Web asset renaming or `PROD_1_Vnn` version changes.
- Changes to Overlay payout formulas.
- Staging, commits, pushes, group membership, secret provisioning, or deploy.

## Working-tree constraints

- LotTicket already has the user's unrelated `AGENTS.md` change; preserve it.
- Overlay has a very large pre-existing dirty/untracked working tree.
  `TicketSearchResultAdapter.kt` specifically contains unrelated payout-summary
  edits that must be preserved. Do not clean, stash, revert, stage, or commit
  either repository. Re-read every existing target immediately before patching
  and report exact resulting diffs.

## Mechanical verification

From LotTicket:

1. `python -m unittest discover -s tests -v`
2. `node scripts/secret-patterns.test.mjs`
3. `node scripts/verify.mjs`
4. `node scripts/check-locked.mjs`
5. `node scripts/check-tracked-secrets.mjs`
6. `python -m py_compile lot_ticket.py ticket_sync.py tests/test_ticket_sync.py`

From Overlay:

7. `node scripts/check-locked.mjs`
8. `.\gradlew.bat :app:compileDebugKotlin`
9. `.\gradlew.bat :app:testDebugUnitTest`

Cross-repository review:

10. Compare the Python golden signed payload byte-for-byte with the Kotlin
    compatibility-test literal.
11. Confirm the final diffs touch only the listed files plus plan/progress
    artifacts and preserve the pre-existing dirty changes.

## Locked-invariant gate

This plan changes no pinned LotTicket version token, award value, Nacional
prize tier/date rule, admin IDs/topic mapping, result-writing admin gate, or
SEC/salt coupling. It changes no Overlay Room schema/version, prefs keys,
manifest permission, `OverlayAction` ID, existing sync wire format/hash, or
versionCode derivation. Therefore `check-locked.mjs --update` is neither
required nor permitted.

Approved by primary, 2026-08-27.
