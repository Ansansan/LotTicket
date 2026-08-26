Always start every response with my name, "Ans"

# LotTicket — Telegram Lottery Ticket Bot (PROD BOT 1)

A Telegram bot for selling Panama lottery plays ("chances" = 2-digit, "billetes"
/ "palets" = 4-digit) across several draws (Nacional, Tica, Nica, La Primera).
Users build a ticket in a Telegram Web App; the bot stores it, renders a PNG
ticket, and forwards it to an admin group. Admins enter draw results and the bot
reports winners and the total payout.

## Architecture

```
Telegram user
   │  DMs the bot; taps a ReplyKeyboard button
   ▼
lot_ticket.py  (the bot worker — runs on PythonAnywhere via infinity_polling)
   │  - serves WebApp buttons → GitHub Pages URL with ?v=BOT_VERSION&uid=…&nacional_dates=…
   │  - on web_app_data: writes tickets_v3 / draw_results (SQLite tickets.db)
   │  - renders the ticket PNG (PIL) + a salted security pattern/SEC code
   │  - calculate_single_ticket(): payout math; reports winners to the admin group
   ▼
Web App  (index.html + script_v22.js + style_v22.css — hosted on GitHub Pages:
          ansansan.github.io/LotTicket)
   │  - ticket builder, admin results entry, history & stats views
   │  - calculateTicketWin(): a PAYOUT PREVIEW that mirrors the bot's math
   ▼
History / Stats API  (HISTORY_API_BASE / API_URL = tel.pythonanywhere.com)
   └─ a separate PythonAnywhere web endpoint, NOT lot_ticket.py (out of this repo).
```

The bot's payout math (`lot_ticket.py`) is **authoritative** for reports; the
web app's `calculateTicketWin` is a user-facing preview. The two share the
`AWARDS` table and prize tiers — keep them in sync (see "Don't break this").

## File map

| File | Purpose | Tracked? |
|---|---|---|
| `lot_ticket.py` | Bot worker: handlers, payout calc, SQLite, PIL ticket images | Yes |
| `index.html` | Web-app shell (Telegram WebApp) — the **live** entry point | Yes |
| `script_v22.js` | Web-app logic + payout preview (mirrors `lot_ticket.py`) | Yes |
| `style_v22.css` | Web-app styles | Yes |
| `config.py` | Real `TOKEN` + `SECURITY_SALT` | **No** (gitignored) |
| `config.example.py` | Placeholder template (`REPLACE_ME`) | Yes |
| `tickets.db` | SQLite (`tickets_v3`, `draw_results`, `nacional_dates`, `nacional_exclusions`) | No (runtime) |
| `flag_*.png` | Lottery flag images used in ticket rendering | No (gitignored) |
| `dadan/` | A second bot copy ("Bot 2"); not driven by this workflow | Yes |
| `app_v2.html`, `app_v4.html` | **Dead** `PROD_1_V14` leftovers — not the live entry | Yes |
| `plans/*.md` | Implementation plans + `*.progress.md` reports | Yes |
| `scripts/*.mjs` | Verification + secret gates (zero-dependency Node ESM) | Yes |

## Deploy workflow — "Nuclear Cache Busting"

Telegram caches the WebApp HTML/JS aggressively. Every release **renames** the
asset files and bumps a single version token so caches break cleanly; missing a
step yields 404s or a redirect loop that kills the History/Stats buttons. The
canonical checklist is in `README.md`. The rule in one line:

> `BOT_VERSION` (`lot_ticket.py`), `CURRENT_VERSION` (`index.html`), and the
> `vNN` embedded in the `style_vNN.css` / `script_vNN.js` filenames the page
> references must **all** equal the same `PROD_1_Vnn`.

`node scripts/verify.mjs` now gates this on every edit and in CI — it was
previously enforced only by memory.

Deploy: commit & push (GitHub Pages rebuilds in ~2 min), then restart the bot on
PythonAnywhere (`cd /home/tel/lot_ticket && /home/tel/task_env/bin/python3 -u
lot_ticket.py`).

## Don't break this

- **Version-sync** (above). All four surfaces equal `PROD_1_Vnn`, and the
  referenced asset files exist. Pinned by `verify.mjs` + `check-locked.mjs`.
- **Payout-table parity.** The `AWARDS` table (`lot_ticket.py:~35`,
  `script_v22.js:~20`) must stay **byte-identical** across the two languages:
  `2_digit_1=14, 2_digit_2=3, 2_digit_3=2, 4_digit_12=1000, 4_digit_13=1000,
  4_digit_23=200`. The Nacional billete prize-tier constants
  (`2000/600/300` exacto, `50/20/10` three-match, `3/2/1` short-match) must not
  silently change. Pinned by `verify.mjs` (parity + golden cases) and
  `check-locked.mjs` (constants).
- **KNOWN DIVERGENCE — do not "fix" without a business decision.** Nacional
  4-digit payouts **stack** across 1st/2nd/3rd prizes in `lot_ticket.py`
  (`calculate_single_ticket`, "Stack across prizes") but take only the **single
  best** prize in `script_v22.js` (`calculateTicketWin`, "Best Prize Wins"). The
  bot report is authoritative; the web app is a preview. `verify.mjs` asserts each
  side's own behavior, never that they are equal.
- **Admin gate on result-writing.** The `save_results` branch of
  `handle_web_app` must keep its `ADMIN_USER_ID`/`ADMIN_GROUP_ID` check — without
  it, any user could write `draw_results`. Pinned by `check-locked.mjs`.
- **Nacional auto-date rule.** `get_nacional_dates_string` auto-marks weekday `2`
  (Wed) and `6` (Sun) over a 30-day window, ± manual (`/nacional`) and exclusion
  (`/nacional_disable`) sets. Pinned by `check-locked.mjs`.
- **SEC code / security pattern depend on `SECURITY_SALT`.**
  `get_short_security_code` = `sha256(f"{id}-{SALT}")[:5].upper()`; the guilloche
  RNG seed = `f"{id}_{SALT}"`. Both must read the same salt. Changing the salt
  invalidates SEC codes on already-issued tickets.
- **Secrets never in tracked source.** `TOKEN` and `SECURITY_SALT` come from the
  gitignored `config.py`. See "Secret handling".

## Codex workflow (Sol plan → Luna execute → Sol review → cold Sol audit)

- Start the primary task with **GPT-5.6 Sol at Max reasoning**. The primary Sol
  agent investigates, writes the approved plan, coordinates implementation,
  reviews the result, and synthesizes the final response.
- After plan approval, delegate implementation to the project custom agent
  `luna_worker`. Luna is the sole implementation writer, may modify only files
  in the approved plan's **Key Changes**, preserves unrelated working-tree
  changes, runs the required validation, and writes the progress report.
- The primary Sol performs the context-bearing review. Then launch a fresh
  `sol_cold_reviewer` with no inherited conversation history
  (`fork_turns = "none"` or the client equivalent) for an independent audit.
  If that audit finds a valid issue, send a bounded fix back to Luna, re-review,
  and launch a new cold audit; repeat until approved or genuinely blocked.
- A cold reviewer declares `sandbox_mode = "read-only"`, but subagents inherit
  the parent's effective sandbox policy. When the parent is workspace-write,
  read-only behavior is enforced by explicit no-edit instructions and by
  verifying the worktree is unchanged before and after the audit; it is not an
  OS-level guarantee.
- Before implementation, record a task-local scope inventory from both
  `git diff --name-only` (tracked changes) and
  `git ls-files --others --exclude-standard` (untracked files). Afterward,
  every changed tracked or untracked file must be justified by the approved
  plan; plan/progress artifacts are reported separately. Staging, committing,
  pushing, and deployment happen only when the user explicitly requests them.
- If a named custom agent, its pinned model, or the required Sol Max primary is
  unavailable, stop and report that limitation rather than silently substituting
  another role or model.

## Claude Code workflow (agent roles)

Canonical workflow, six steps (`.claude/agents/*.md`):

1. Primary (the session model) investigates, writes the plan, and approves it;
   the user inspects the delivered result. The only human gate is the
   locked-invariant approval: a Key Change that moves any surface pinned by
   `scripts/locked-snapshot.json` (the `PROD_1_Vnn` version token, an `AWARDS`
   value, the Nacional prize tiers or auto-date rule, `ADMIN_GROUP_ID` /
   `ADMIN_USER_ID`, `TOPIC_MAPPING`, the `save_results` admin gate, the
   SEC-code/salt coupling) needs explicit user approval plus
   `node scripts/check-locked.mjs --update` in the same change.
2. `executor` (`model: sonnet`) — the heavy-lifting implementation writer —
   implements only the approved plan's Key Changes.
3. `executor` commits each logical step with a `<slug>: ` subject prefix
   (explicit file paths only — bulk staging is denied by the secret guard),
   commits the progress artifact (`plans/<slug>.progress.md`) last, and never
   pushes.
4. Primary independently runs verification (`node scripts/verify.mjs`,
   `node scripts/check-locked.mjs`) — not the executor's word for it.
5. Exactly one fresh `auditor` (`model: inherit`, spawned with no inherited
   conversation history) performs the final audit. It may read the approved
   plan for scope compliance; never the executor's progress / revision reports
   or any session summary.
6. Primary evaluates the audit findings and delivers the final response.

`planner` and `reviewer` are optional helpers, not stages of this workflow —
the primary invokes them only when useful (e.g., to draft a plan or get an
adversarial pass on one). The `/auto-workflow` skill automates the same
six-step sequence; see `.claude/skills/auto-workflow/SKILL.md`.

- Do not let the primary agent or a second write-capable agent edit
  implementation files concurrently with `executor`.
- If `executor` or `auditor` (or its configured model) is unavailable, stop and
  report that limitation BEFORE delegating. Do not silently substitute another
  agent or model, and never collapse the cold audit into the context-bearing
  primary thread.
- Plans live in `plans/<YYYY-MM-DD>-<slug>.md`, one per task. Never overwrite a
  plan; revisions are `<slug>-v2.md`, `<slug>-v3.md`.
- Executor writes `plans/<slug>.progress.md` at end of run, and must not modify
  files outside the plan's Key Changes — if one is needed, it stops and writes
  `plans/<slug>.revision-requested.md` instead.
- Every file in `git diff main --name-only` after execution must be justified
  by a line in the final approved plan. Pushing and deployment (GitHub Pages +
  PythonAnywhere restart) happen only when the user explicitly requests them.

## Mechanical verification

Two zero-dependency Node ESM gates in `scripts/` (run with `node`, no
`package.json`, no install). Both CRLF→LF normalize so Windows and Linux CI
agree. Optional first arg = a root dir (used to run a gate against a scratch
copy).

- **`node scripts/verify.mjs`** — (1) **version-sync**: extracts `BOT_VERSION`,
  `CURRENT_VERSION`, and the page's `style_vNN.css` / `script_vNN.js` references
  and asserts they all match, each asset URL carries a matching `?v=` query
  token, and the assets exist; (2) **payout-parity**: asserts
  the `AWARDS` table is identical between `lot_ticket.py` and `script_v22.js`,
  then extracts the `// ===PAYOUT-LOGIC-START===` … `// ===PAYOUT-LOGIC-END===`
  block from `script_v22.js`, `new Function()`-evaluates it, and runs golden
  payout cases. **Anti-tamper:** an *absent* `lot_ticket.py` fails **open**
  (nothing to check), but a *present* file with a referenced asset missing, or a
  *present* `script_v22.js` with the markers stripped, fails **closed** (exit 2) —
  no vacuous pass. The markers are a contract; do not remove them; (3)
  **draw-schedule**: asserts Nica noon daily, Nica 7pm weekend-only, and the
  retired Nica 1pm label remains available only for historical tickets.
- **`node scripts/check-locked.mjs`** — pins the locked invariants against
  `scripts/locked-snapshot.json`: the version token, the 6 `AWARDS` pairs,
  `ADMIN_GROUP_ID`/`ADMIN_USER_ID`, `TOPIC_MAPPING`, the Nacional weekday set
  `(2,6)` + 30-day window, the Nacional prize-tier set, and the presence of the
  `save_results` admin gate. Drift → exit 2 with a per-surface hint. A deliberate,
  approved change is acknowledged with `node scripts/check-locked.mjs --update`;
  commit the snapshot diff in the same PR.

`.github/workflows/verify.yml` runs both on every push / PR (node 24).

## Enforcement (Claude Code hooks)

`.claude/settings.json` (tracked, shared) wires the gates to run automatically:

- **PreToolUse Bash** → `node scripts/guard-bash-secrets.mjs` — blocks bulk
  staging (`git add -A`/`.`, `git commit -a`) and staging a secret-by-path file.
- **PreToolUse Write** → `node scripts/guard-plan-overwrite.mjs` — denies
  overwriting an existing `plans/*.md` (exempts `*.progress.md` /
  `*.revision-requested.md`).
- **PostToolUse Edit|Write** → `node scripts/verify.mjs` then
  `node scripts/check-locked.mjs` — surfaces a broken rule / drifted invariant
  immediately after an edit lands.
- **Stop** → `node scripts/verify.mjs` — the gate must be green before the session
  ends.

All guards **fail open** on malformed/missing hook stdin so a harness change
never wedges the session.

## Secret handling

The real `TOKEN` (Telegram bot credential) and `SECURITY_SALT` live **only** in
the gitignored `config.py`; `lot_ticket.py` imports them. Tracked source carries
placeholders in `config.example.py` (value `REPLACE_ME`). To set up a clone:
`cp config.example.py config.py` and fill in the real values.

- **`scripts/secret-patterns.mjs`** is the single source of truth: `isSecretPath`
  covers `config.py`, `*.token`, `*.secret`, `.env`/`.env.*`;
  `scanContentForSecrets` flags a Telegram-bot-token shape or a real
  (non-`REPLACE_ME`) `TOKEN` / `SECURITY_SALT` assignment. When documenting the
  token by example, build it by concatenation at runtime — never write a literal
  token/salt in tracked source, or the staged-secret scan will (correctly) flag
  the doc.
- **`scripts/check-staged-secrets.mjs`** is the git-native pre-commit body (path +
  content scan of the staged set). Activated **once per clone** with:

  ```
  git config core.hooksPath scripts/git-hooks
  ```

  This is local git config (not a tracked artifact). The
  `scripts/git-hooks/pre-commit` shim is committed; the `core.hooksPath` pointer
  is the per-machine activation.

> ⚠️ **The previous `TOKEN` and `SECURITY_SALT` were committed to this public repo
> and are in git history.** They must be considered compromised: **rotate the
> token in @BotFather** (which invalidates the old one) and choose a new salt,
> then update `config.py`. Deleting the line is not enough — the value remains in
> history.
