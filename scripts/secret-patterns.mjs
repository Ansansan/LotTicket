// Single source of truth for "what is a secret" in the LotTicket repo.
// Shared by the git-native pre-commit hook (scripts/check-staged-secrets.mjs)
// and the Claude PreToolUse Bash guard (scripts/guard-bash-secrets.mjs) so both
// paths use exactly the same definition.
//
// Real secrets (the Telegram bot TOKEN and the SECURITY_SALT) live only in the
// gitignored config.py; tracked source carries placeholders (config.example.py).
// The example shapes below are described, never written as literal assignments,
// so this module never flags its own source.

import path from 'node:path';

// Filenames that are always secrets regardless of directory.
export const SECRET_BASENAMES = ['config.py', 'config.json', 'secrets.json', 'credentials.json'];

// Ad-hoc token/secret/key/cert/env files.
export const SECRET_EXT_RE = /\.(token|secret|pem|key|p12|pfx|keystore)$/i;
export const DOTENV_RE = /(^|\/)\.env(\..*)?$/i;

// The safe placeholder value: a config.example.py carrying this is NOT a leak.
const PLACEHOLDER = 'REPLACE_ME';

// (1) A Telegram bot-token shape: a 6-12 digit bot id, a colon, then ~34-46
// url-safe chars. (Real tokens vary: the official doc example has a 34-char auth
// segment, and newer bot ids exceed 10 digits — the old {35}/8-10 form missed
// both.) The regex contains no such literal run, so scanning this file does not
// self-trigger.
const TELEGRAM_TOKEN_RE = /\b\d{6,12}:[A-Za-z0-9_-]{34,46}\b/;

// (2) A real value assigned to a secret-ish key in `key = "value"` or JSON
// `"key": "value"` form. Covers common names (BOT_TOKEN / API_TOKEN / AUTH_TOKEN
// / TOKEN / SECURITY_SALT / SALT / SECRET / API_KEY, case-insensitive) and both
// the `=` and `:` separators. A bare mention or an env read (no quoted literal)
// is NOT flagged; the REPLACE_ME placeholder and empty values are safe per the
// scan below.
const SECRET_ASSIGN_RE = /\b(?:BOT_TOKEN|API_TOKEN|AUTH_TOKEN|TOKEN|SECURITY_SALT|SALT|SECRET|API_KEY)["']?\s*[:=]\s*["']([^"']*)["']/gi;

function normalize(relPath) {
  return String(relPath).replace(/\\/g, '/');
}

export function isSecretPath(relPath) {
  const norm = normalize(relPath);
  const base = path.posix.basename(norm);
  if (SECRET_BASENAMES.includes(base)) return true;
  if (SECRET_EXT_RE.test(norm)) return true;
  if (DOTENV_RE.test(norm)) return true;
  return false;
}

export function scanContentForSecrets(text) {
  // CRLF->LF + strip a leading BOM so a Windows-saved file matches an LF
  // checkout the same way.
  const normalized = String(text).replace(/^﻿/, '').replace(/\r\n/g, '\n');
  if (TELEGRAM_TOKEN_RE.test(normalized)) return true;
  for (const m of normalized.matchAll(SECRET_ASSIGN_RE)) {
    if (m[1] && m[1] !== PLACEHOLDER) return true;
  }
  return false;
}
