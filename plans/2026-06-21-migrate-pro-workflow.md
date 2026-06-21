# Migrate the mature multi-agent dev workflow into the LotTicket repo

## 1. Context

Three sibling repos — `langostino project` (closest analog: a single-HTML web
app), `Payer trend dashboard`, and `Overlay Floating Telegram Reader` (most
mature) — run a hardened **planner → executor → reviewer → auditor** workflow
with machine-checked guardrails: a `verify.mjs` logic-contract gate, a
`check-locked.mjs` invariant snapshot, secret guards on the commit path, a
plan-overwrite guard, Claude Code hooks that fire the gates automatically, and
CI. The Payer repo even contains a written playbook
(`plans/2026-06-20-migrate-pro-workflow.md`) for porting this system.

This repo (LotTicket — a Telegram lottery-ticket bot) has **none** of it: no
`.claude/`, no `scripts/`, no `plans/`, no `CLAUDE.md`, no `AGENTS.md`, no CI.
Its fragile rules are enforced by nothing but memory:

- **Version-sync ("Nuclear Cache Busting", `README.md`).** `BOT_VERSION`
  (`lot_ticket.py:48`), `CURRENT_VERSION` (`index.html:14`), the
  `style_v21.css` / `script_v21.js` link/script references (`index.html:27,240`),
  and the on-disk filenames must **all** equal the same `PROD_1_Vnn`. The README
  documents exactly what breaks on a missed step: 404s and a redirect-loop that
  kills the History/Stats buttons. Today nothing checks it.
- **Payout math is duplicated in two languages.** `calculate_single_ticket`
  (`lot_ticket.py:165`) and the frontend checker (`script_v21.js:520-603`) share
  an `AWARDS` table (`lot_ticket.py:35`, `script_v21.js:20`) and a set of
  hardcoded Nacional prize tiers. A constant drifting between the two is an
  invisible money bug. (A real aggregation divergence already exists — see §5.)
- **Live secrets are committed to a public repo.** `TOKEN` (`lot_ticket.py:20`)
  and `SECURITY_SALT` (`lot_ticket.py:26`) sit in tracked source. The repo is
  public (`github.com/Ansansan/LotTicket`, backs GitHub Pages), so the token is
  harvestable and the salt defeats the SEC-code anti-counterfeit
  (`get_short_security_code`, `lot_ticket.py:160`). There is no guard to stop the
  next secret commit.

This plan ports the workflow (Phases 1–3 of the reference playbook; `.codex/`
mirror deferred), adapted to this repo's split Python-bot + GitHub-Pages-frontend
architecture, and adds a **Phase 0** to externalize the secrets so the secret
guards have a clean tree to protect.

## 2. Summary

Externalize `TOKEN` + `SECURITY_SALT` into a gitignored `config.py` (placeholder
in source) [Phase 0]. Add a zero-dependency Node ESM `scripts/` toolchain
(`verify.mjs`, `check-locked.mjs` + `locked-snapshot.json`, `secret-patterns.mjs`,
`guard-bash-secrets.mjs`, `check-staged-secrets.mjs`, `guard-plan-overwrite.mjs`,
`git-hooks/pre-commit`) [Phase 1]. Wire them through a tracked
`.claude/settings.json` and add `.github/workflows/verify.yml` (node 24)
[Phase 2]. Add the four agent defs and author a `CLAUDE.md` (this repo has none)
with a "Don't break this" section plus a `plans/README.md` [Phase 3]. The only
product-source edits beyond Phase 0 are **purely additive comment markers**
around the already-pure JS payout block in `script_v21.js`, zero behavior change,
so `verify.mjs` can extract and assert it.

`verify.mjs` enforces **two contracts** for this repo:
1. **Version-sync** — regex-extract the version token from `lot_ticket.py`,
   `index.html` (constant + link href + script src), confirm all equal and the
   referenced asset files exist on disk. No eval.
2. **Payout-parity** — assert the `AWARDS` table is byte-identical between
   `lot_ticket.py` and `script_v21.js`; extract the marked JS payout block,
   `new Function()`-evaluate it, and assert golden payout cases (2-digit, 4-digit
   standard, Nacional). The Python↔JS **Nacional-billete aggregation divergence**
   (§5) is documented as a known invariant, not asserted equal.

## 3. Key Changes

Every file the executor (or bootstrapping main session) will create or edit.
Anything not in this list is out of scope.

### Phase 0 — Secret externalization (product behavior change)

- **`config.py`** (NEW, gitignored) — holds the real `TOKEN` and `SECURITY_SALT`.
- **`config.example.py`** (NEW, tracked) — template with placeholder values
  (`TOKEN = "REPLACE_ME"`, `SECURITY_SALT = "REPLACE_ME"`) documenting the shape.
- **`lot_ticket.py`** (EDIT, lines 19–26) — replace the two inline literals with
  `from config import TOKEN, SECURITY_SALT` (with a clear ImportError message
  pointing at `config.example.py`). No other logic touched. **`ADMIN_GROUP_ID`,
  `ADMIN_USER_ID`, `HISTORY_API_BASE`, `GITHUB_BASE_URL` stay inline** — they are
  not secrets (group/user IDs are not credentials; the API base and Pages URL are
  already public in client traffic).
- **Manual user action (NOT done by the executor), documented in `CLAUDE.md`:**
  rotate the bot token in **@BotFather** (invalidates the leaked one) and choose a
  new `SECURITY_SALT` (note: changing the salt invalidates SEC codes on
  previously-issued tickets — a one-time, accepted cost).

### Phase 1 — `scripts/` (zero-dependency Node ESM, `.mjs`, CRLF→LF normalized)

- **`scripts/verify.mjs`** (NEW) — the two contracts in §2. Failure modes mirror
  the references: a *referenced asset file absent* (e.g. `script_v21.js` missing)
  is a **failure** (exit 2), but if `lot_ticket.py` itself is absent, fail
  **open** (exit 0, "nothing to check"). A *present `script_v21.js` with the
  `// ===PAYOUT-LOGIC-*===` markers removed* is a **failure** (exit 2, anti-tamper
  — no vacuous pass). Prints `verify: OK (N checks)` / `verify: FAILED (...)`.
  **All extraction is pure Node regex/`new Function()` — no Python shell-out — so
  CI needs no interpreter.**
- **`scripts/check-locked.mjs`** (NEW) — extracts this repo's invariant surfaces
  (§5) and diffs against `scripts/locked-snapshot.json`. `--update` re-blesses.
  Same extract/diff skeleton as Overlay's. Exit 0 = match, exit 2 = drift with a
  per-surface hint.
- **`scripts/locked-snapshot.json`** (NEW) — golden snapshot, generated by
  `node scripts/check-locked.mjs --update` once after the extractor is written.
- **`scripts/secret-patterns.mjs`** (NEW) — single source of truth, adapted to
  this repo:
  - `isSecretPath(relPath)` → true for basename `config.py`, for `*.token` /
    `*.secret`, and for `.env` / `.env.*`.
  - `scanContentForSecrets(text)` → flag (a) a Telegram bot-token shape
    `\b\d{8,10}:[A-Za-z0-9_-]{35}\b`, and (b) a `TOKEN =` / `SECURITY_SALT =`
    assignment whose quoted value is **not** `REPLACE_ME`. The `REPLACE_ME`
    placeholder is the safe sentinel (so `config.example.py` never flags).
- **`scripts/guard-bash-secrets.mjs`** (NEW) — ported from Overlay; acts on
  `git (add|commit|stash)`, blocks bulk staging (`-A`/`--all`/`.`/`commit -a`) and
  staging an `isSecretPath` file. Fails open on bad stdin.
- **`scripts/check-staged-secrets.mjs`** (NEW) — ported from Overlay; pre-commit
  body: path + content scan of the staged ACM set. Fails open on git/IO error.
- **`scripts/git-hooks/pre-commit`** (NEW) — the one-line POSIX shim, identical to
  the references. Activated once by `git config core.hooksPath scripts/git-hooks`
  (documented, NOT run by the executor — local git config, not a tracked change).
- **`scripts/guard-plan-overwrite.mjs`** (NEW) — ported verbatim from langostino
  (repo-agnostic; resolves root from `import.meta.url`).
- **`script_v21.js`** (EDIT — **two additive comment lines only**) — wrap the
  payout block in `// ===PAYOUT-LOGIC-START===` / `// ===PAYOUT-LOGIC-END===` so
  the marked span contains the `AWARDS` const (line 20) and the
  `checkWinner`-style function (≈520–603). `verify.mjs` appends a
  `;return { AWARDS, <fn> };` at eval time — no source export added. Confirm via
  `git diff` the change is exactly two added comment lines.

### Phase 2 — Wiring & CI

- **`.claude/settings.json`** (NEW, tracked) — PreToolUse `Bash` →
  `guard-bash-secrets.mjs`; PreToolUse `Write` → `guard-plan-overwrite.mjs`;
  PostToolUse `Edit|Write` → `verify.mjs` then `check-locked.mjs`; Stop →
  `verify.mjs`. Node-only invocations (cross-platform).
- **`.github/workflows/verify.yml`** (NEW) — `on: [push, pull_request]`,
  `ubuntu-latest`, `actions/setup-node@v4` node 24, runs `node scripts/verify.mjs`
  and `node scripts/check-locked.mjs`.
- **`.gitignore`** (EDIT) — append `config.py`, `*.token`, `*.secret`, `.env`,
  `.env.*`, `.claude/settings.local.json`. Keep existing lines
  (`__pycache__/`, `*.pyc`, `backups/`, `flag_*.png`) verbatim.

### Phase 3 — Agents & docs

- **`.claude/agents/planner.md`** (NEW) — ported from langostino verbatim
  (repo-agnostic 8-section contract).
- **`.claude/agents/executor.md`** (NEW) — ported from langostino (leave-
  uncommitted model).
- **`.claude/agents/reviewer.md`** (NEW) — ported, with the **Domain invariants**
  paragraph rewritten for this repo (payout-table parity, admin gate on
  result-writing, version-sync, salt→SEC coupling — see §5) and the call-chain
  check kept.
- **`.claude/agents/auditor.md`** (NEW) — ported, cold/fresh-session. Because this
  repo has no `docs/requirements.md`, it reads `CLAUDE.md` "Don't break this" +
  `README.md`; Mode-A step-3 command becomes `node scripts/verify.mjs`
  (+ `check-locked.mjs`).
- **`CLAUDE.md`** (NEW) — authored from scratch: project overview, the file/deploy
  map (cache-busting protocol), a **"Don't break this"** section (§5 invariants),
  and the Workflow / Mechanical-verification / Enforcement / Secret-handling
  sections (incl. the one-time `core.hooksPath` install and the @BotFather
  rotation step).
- **`plans/README.md`** (NEW) — the `YYYY-MM-DD-<slug>.md` + `<slug>.progress.md`
  convention (ported from Overlay).

## 4. Out of Scope

- **`.codex/` Codex mirror** — deferred (Phase 4 in the reference). No
  `.codex/hooks.json`, no Codex agent mirror.
- **Reconciling the Nacional-billete stack-vs-best divergence (§5).** This plan
  *documents and pins the constants*, it does **not** change either payout
  implementation. Reconciliation (deciding whether the bot or the frontend is
  authoritative) is a separate, business-decision task.
- **`dadan/`** (the second bot copy) and the stale `app_v2.html` / `app_v4.html`
  (`PROD_1_V14` leftovers) — left untouched; the version-sync check pins only the
  live `index.html` ↔ `lot_ticket.py` pair.
- **No new payout/date tests inside `lot_ticket.py`.** `verify.mjs` asserts the JS
  side and the cross-language `AWARDS` equality; the Python payout function is not
  refactored.
- **No DB / schema changes**, no changes to image generation, menus, or handlers
  beyond the Phase-0 two-line secret import.

## 5. Interfaces / Contracts

`check-locked.mjs` / `verify.mjs` pin these. Each surface lists its source +
anchor (verified against current files).

- **Version token (1)** — must be equal across: `BOT_VERSION` (`lot_ticket.py:48`),
  `CURRENT_VERSION` (`index.html:14`), the `?v=` query in `index.html` (none on
  the static link — see filename refs), and the asset filenames referenced at
  `index.html:27` (`style_v21.css`) and `index.html:240` (`script_v21.js`). The
  embedded `vNN` in those filenames must match the token's `Vnn`. All four
  referenced files must exist on disk. Current value: `PROD_1_V21`.
- **`AWARDS` table (6 entries)** — `lot_ticket.py:35-38` and `script_v21.js:20-23`
  must define the identical 6 key/value pairs: `2_digit_1=14`, `2_digit_2=3`,
  `2_digit_3=2`, `4_digit_12=1000`, `4_digit_13=1000`, `4_digit_23=200`.
- **Nacional prize-tier constants** — the literals `2000, 600, 300` (exacto),
  `50, 20, 10` (3-match), `3, 2, 1` (2/1-match) appear in both
  `lot_ticket.py:204-237` and `script_v21.js:548-567`. Pinned as a present-set
  (constants must not silently change). **KNOWN DIVERGENCE (documented, NOT
  asserted equal):** Python *stacks* winnings across 1st/2nd/3rd prizes
  (`lot_ticket.py:197` "Stack across prizes"); the frontend takes only the single
  *best* prize (`script_v21.js:542` "Best Prize Wins"). The frontend is a user
  preview; the bot's report is authoritative. Do not "fix" one to match the other
  without a business decision.
- **Admin gate on result-writing** — `handle_web_app` `save_results` branch
  (`lot_ticket.py:415-417`) must keep its `ADMIN_USER_ID`/`ADMIN_GROUP_ID` check.
  `check-locked` pins the presence of that guard so a regression that drops it
  (letting any user write `draw_results`) trips the gate.
- **Admin identity constants** — `ADMIN_GROUP_ID` (`lot_ticket.py:21`),
  `ADMIN_USER_ID` (`lot_ticket.py:22`), `TOPIC_MAPPING` (`lot_ticket.py:32`) are
  pinned (a typo here silently misroutes or mis-authorizes).
- **Nacional auto-date rule** — `get_nacional_dates_string` (`lot_ticket.py:130`)
  treats weekday `2` (Wed) and `6` (Sun) over a 30-day window as auto-Nacional,
  ± manual/exclusion sets. Pinned as `(2, 6)` + window `30`.
- **Salt → SEC-code coupling** — `get_short_security_code`
  (`lot_ticket.py:160-163`) = `sha256(f"{id}-{SALT}")[:5].upper()`; the guilloche
  RNG seed (`lot_ticket.py:463`) = `f"{id}_{SALT}"`. After Phase 0 the salt comes
  from `config.py`; the *coupling* (both read the same salt) is the invariant.
- **Token discriminator** — tracked safe placeholder is `REPLACE_ME` (in
  `config.example.py` and the post-Phase-0 `lot_ticket.py` has no literal).
  `scanContentForSecrets` flags any real Telegram-token shape or any
  `TOKEN`/`SECURITY_SALT` assignment with a non-`REPLACE_ME` value.
- **Hook JSON contract** — guards read `tool_input.command` (Bash) /
  `tool_input.file_path` (Write) from stdin JSON and **fail open** on any parse
  error, so a harness change never wedges the session.

## 6. Assumptions & Decisions

- **Phase 0 first (secret externalization).** *Why:* the secret guards assume a
  clean tree; with the live token inline, `check-staged-secrets` would flag
  `lot_ticket.py` on every commit. *Chosen:* gitignored `config.py` +
  `config.example.py` placeholder, matching the references' placeholder-in-source
  model. *User action required:* rotation in @BotFather (I cannot rotate a
  Telegram token) — documented in `CLAUDE.md`. *Rejected:* env vars only (less
  discoverable for a single-host PythonAnywhere deploy); leaving secrets inline
  (defeats the whole secret layer and keeps the exposure live).
- **Pure-Node payout verify (no Python in CI).** *Why:* the reference `verify.mjs`
  is zero-dependency and CI runs node-only. The JS payout block is already pure
  and evaluable; the Python `AWARDS` is compared by **regex text extraction**, not
  by running Python. *Rejected:* `spawnSync('python', ...)` to run the Python
  payout (would make CI depend on a Python interpreter + the bot's heavy imports —
  `telebot`, `PIL`, `pytz`).
- **Document, don't fix, the stack-vs-best divergence.** It is a real Python↔JS
  difference but plausibly intentional (preview vs authoritative report). Pinning
  the *constants* catches drift; reconciling the *rule* is a business call kept
  out of scope (§4).
- **No `CLAUDE.md` exists — author one.** Unlike the Payer migration (which
  appended to an existing big `CLAUDE.md`), this repo starts empty, so the doc is
  created whole. The README's deploy protocol is referenced, not duplicated.
- **`.gitignore` only appends.** The repo's `.gitignore` does not currently ignore
  `.claude/`, so the agent defs + `settings.json` become tracked with no
  un-ignoring needed; only `settings.local.json` and the new secret paths are
  added.
- **Existing reuse, not rewrite.** `guard-plan-overwrite.mjs`,
  `guard-bash-secrets.mjs`, `check-staged-secrets.mjs`, `git-hooks/pre-commit`,
  `verify.yml`, and all four agent defs are ported from langostino/Overlay with
  this repo's surfaces substituted; `verify.mjs`/`check-locked.mjs` reuse the
  reference finish/eq + extract/diff/`--update` skeletons.
- **Bootstrapping is done by the main session.** The planner/executor/reviewer
  agents do not exist until this plan lands, so the first implementation pass is
  run by the orchestrator; subsequent changes use the installed agents.

## 7. Verification

Run from the repo root: `C:\Users\Batman\Desktop\lot ticket bots\lot ticket bot`.

### Mechanical (commands)

1. **Version-sync passes.** `node scripts/verify.mjs` → `verify: OK (N checks)`,
   exit 0, with all four version surfaces reading `PROD_1_V21` and both asset
   files present.
2. **Version-sync FAILS on drift (non-vacuous).** In a scratch copy of
   `index.html`, change `CURRENT_VERSION` to `PROD_1_V22`; run `verify.mjs` →
   exit 2 naming the mismatch. Revert.
3. **Payout-parity passes.** Same `verify.mjs` run asserts `AWARDS` py==js and the
   golden JS payout cases.
4. **Payout-parity FAILS on `AWARDS` drift (non-vacuous).** In a scratch copy of
   `script_v21.js`, change `'2_digit_1': 14.00` to `15.00`; run `verify.mjs` →
   exit 2 naming the `AWARDS` mismatch. Revert.
5. **Anti-tamper: marker removal FAILS.** In a scratch copy of `script_v21.js`,
   delete the two `// ===PAYOUT-LOGIC-*===` lines; `verify.mjs` → exit 2
   ("missing PAYOUT-LOGIC block"), not exit 0. Revert.
6. **Fail-open: missing source.** Point `verify.mjs` at a nonexistent
   `lot_ticket.py` path → exit 0 ("nothing to check").
7. **Locked snapshot created and matches.** `node scripts/check-locked.mjs
   --update` then `node scripts/check-locked.mjs` → second run exits 0.
8. **Locked gate FAILS on drift.** Scratch-edit `ADMIN_USER_ID`; `check-locked` →
   exit 2 with the admin-id surface hint. Revert.
9. **Secret scanner: placeholder safe, real token flagged.** A throwaway `.mjs`
   importing `secret-patterns.mjs` asserts that a placeholder assignment (value
   `REPLACE_ME`) returns `false`, while a real Telegram-token-shaped value
   (8–10 digits, a colon, then 35 url-safe chars) or a non-placeholder
   `SECURITY_SALT` value returns `true`. (Construct the positive example by
   concatenation at runtime — never embed a literal token in tracked source, or
   the staged-secret hook will correctly flag the doc itself.)
10. **Path scanner.** `isSecretPath('config.py') === true`,
    `isSecretPath('config.example.py') === false`,
    `isSecretPath('lot_ticket.py') === false`.
11. **Bash guard.** `echo '{"tool_input":{"command":"git add -A"}}' | node
    scripts/guard-bash-secrets.mjs; echo $?` → 2; `git add config.py` → 2;
    `git add lot_ticket.py` → 0; `not json` → 0 (fail open).
12. **Plan-overwrite guard.** Crafted stdin for
    `plans/2026-06-21-migrate-pro-workflow.md` → exit 2; a `*.progress.md` path →
    exit 0.
13. **Staged-secret hook clean on the post-Phase-0 tree.**
    `node scripts/check-staged-secrets.mjs; echo $?` → 0 (the real token now lives
    only in gitignored `config.py`).
14. **`script_v21.js` diff is comment-only.** `git diff -- script_v21.js` → exactly
    two added `// ===PAYOUT-LOGIC-*===` lines.
15. **`lot_ticket.py` diff is the secret import only.** `git diff -- lot_ticket.py`
    → the two literals replaced by the `from config import ...` line (+ guard),
    nothing else.
16. **Bot still imports cleanly.** With a real `config.py` present,
    `python -c "import config"` succeeds (smoke check that the import path works;
    full bot run is manual).

### Visual (manual)

- **`.gitignore` review.** `git status` shows `.claude/settings.json` +
  `.claude/agents/*.md` trackable; `config.py` and `.claude/settings.local.json`
  ignored; the original four ignore lines intact.
- **Agent docs read correctly** (executor leave-uncommitted; reviewer call-chain +
  lottery domain-invariants; auditor cold, points at `CLAUDE.md` not
  `docs/requirements.md`).
- **`CLAUDE.md`** reads coherently; "Don't break this" lists §5; the @BotFather
  rotation + `core.hooksPath` one-time steps are documented and noted as NOT run
  by the executor.

## 8. Definition of Done

- [ ] Phase 0: `config.py` (gitignored) + `config.example.py` (placeholder)
      exist; `lot_ticket.py` reads `TOKEN`/`SECURITY_SALT` from `config`; no token
      literal remains in tracked source (Mechanical 15, 16). @BotFather rotation +
      new salt documented as the user's manual step.
- [ ] `scripts/verify.mjs` enforces version-sync (Mechanical 1, 2) + payout-parity
      (3, 4), is anti-tamper (5), fails open only on absent source (6).
- [ ] `scripts/check-locked.mjs` + snapshot pin the §5 surfaces; exits 0 clean (7),
      trips on drift (8).
- [ ] Secret scripts: `secret-patterns.mjs` (9, 10), `guard-bash-secrets.mjs` (11),
      `check-staged-secrets.mjs` + `git-hooks/pre-commit` (13).
- [ ] `guard-plan-overwrite.mjs` denies plan overwrite, exempts `*.progress.md`
      (12).
- [ ] `.claude/settings.json` wires all hooks; `.github/workflows/verify.yml` runs
      both gates on node 24.
- [ ] All four agent defs present; reviewer/auditor domain sections rewritten for
      lottery (§5).
- [ ] `CLAUDE.md` + `plans/README.md` authored; "Don't break this" = §5; rotation
      + `core.hooksPath` documented.
- [ ] `.gitignore` appended (config.py, *.token, *.secret, .env/.env.*,
      .claude/settings.local.json); original lines intact.
- [ ] `script_v21.js` diff = two comment lines; `lot_ticket.py` diff = secret
      import only (14, 15).
- [ ] `dadan/`, `app_v2.html`, `app_v4.html`, image/menu/DB code, and the two
      payout *implementations* are NOT modified.
- [ ] All scripts zero-dependency Node ESM with CRLF→LF normalization; no
      `package.json`.
