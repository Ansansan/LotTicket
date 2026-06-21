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
export const SECRET_BASENAMES = ['config.py'];

// Ad-hoc token/secret/env files.
export const SECRET_EXT_RE = /\.(token|secret)$/i;
export const DOTENV_RE = /(^|\/)\.env(\..*)?$/i;

// The safe placeholder value: a config.example.py carrying this is NOT a leak.
const PLACEHOLDER = 'REPLACE_ME';

// (1) A Telegram bot-token shape: an 8-10 digit bot id, a colon, then 35
// url-safe chars. The regex contains no such literal run, so scanning this
// file does not self-trigger.
const TELEGRAM_TOKEN_RE = /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/;

// (2) A real value assigned to TOKEN or SECURITY_SALT in `key = "value"` form.
// A bare mention or a `from config import TOKEN` (no `=` then quote) is NOT
// flagged; the REPLACE_ME placeholder is treated as safe by the scan below.
const SECRET_ASSIGN_RE = /\b(?:TOKEN|SECURITY_SALT)\s*=\s*["']([^"']*)["']/g;

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
    if (m[1] !== PLACEHOLDER) return true;
  }
  return false;
}
