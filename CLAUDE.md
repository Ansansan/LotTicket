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
Web App  (index.html + script_v21.js + style_v21.css — hosted on GitHub Pages:
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
| `script_v21.js` | Web-app logic + payout preview (mirrors `lot_ticket.py`) | Yes |
| `style_v21.css` | Web-app styles | Yes |
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
  `script_v21.js:~20`) must stay **byte-identical** across the two languages:
  `2_digit_1=14, 2_digit_2=3, 2_digit_3=2, 4_digit_12=1000, 4_digit_13=1000,
  4_digit_23=200`. The Nacional billete prize-tier constants
  (`2000/600/300` exacto, `50/20/10` three-match, `3/2/1` short-match) must not
  silently change. Pinned by `verify.mjs` (parity + golden cases) and
  `check-locked.mjs` (constants).
- **KNOWN DIVERGENCE — do not "fix" without a business decision.** Nacional
  4-digit payouts **stack** across 1st/2nd/3rd prizes in `lot_ticket.py`
  (`calculate_single_ticket`, "Stack across prizes") but take only the **single
  best** prize in `script_v21.js` (`calculateTicketWin`, "Best Prize Wins"). The
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

## Workflow (planner → executor → reviewer → auditor)

Non-trivial changes run through four agent roles (`.claude/agents/*.md`):

- **planner** — writes a plan to `plans/<date>-<slug>.md` (never overwrites one;
  revisions are `-v2.md`). Read-only except plan files.
- **executor** — implements the approved plan, touches only files in the plan's
  Key Changes. **Leave-uncommitted model:** all work stays in the working tree;
  it does NOT commit/stage/push. The orchestrator (main session) commits, pushes,
  and opens the PR once, after the reviewer APPROVES. Writes a
  `plans/<slug>.progress.md` report at the end.
- **reviewer** — adversarial; runs the Mechanical checks, diffs `git diff main
  --name-only` against Key Changes, and checks the "Don't break this" invariants
  (version-sync, payout parity, admin gate, secrets). Verdict only; never edits.
- **auditor** — cold, run from a FRESH session; reads CLAUDE.md "Don't break this"
  + README, never `plans/` or `*.progress.md`. Independent re-derivation.

## Mechanical verification

Two zero-dependency Node ESM gates in `scripts/` (run with `node`, no
`package.json`, no install). Both CRLF→LF normalize so Windows and Linux CI
agree. Optional first arg = a root dir (used to run a gate against a scratch
copy).

- **`node scripts/verify.mjs`** — (1) **version-sync**: extracts `BOT_VERSION`,
  `CURRENT_VERSION`, and the page's `style_vNN.css` / `script_vNN.js` references
  and asserts they all match + the assets exist; (2) **payout-parity**: asserts
  the `AWARDS` table is identical between `lot_ticket.py` and `script_v21.js`,
  then extracts the `// ===PAYOUT-LOGIC-START===` … `// ===PAYOUT-LOGIC-END===`
  block from `script_v21.js`, `new Function()`-evaluates it, and runs golden
  payout cases. **Anti-tamper:** an *absent* `lot_ticket.py` fails **open**
  (nothing to check), but a *present* file with a referenced asset missing, or a
  *present* `script_v21.js` with the markers stripped, fails **closed** (exit 2) —
  no vacuous pass. The markers are a contract; do not remove them.
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
