// PreToolUse Bash guard: early feedback before a `git add`/`commit`/`stash`
// can stage a secret. Defense-in-depth alongside the git-native pre-commit
// hook (scripts/check-staged-secrets.mjs) — this one catches it at the
// proposed-command stage and explains why to Claude.
//
// Exit 0 = allow; exit 2 = deny (stderr message fed back to Claude).
// Fails open (exit 0) on malformed/missing stdin — never block on a parse error.

import { readFileSync } from 'node:fs';
import { isSecretPath } from './secret-patterns.mjs';

let raw = '';
try {
  raw = readFileSync(0, 'utf8');
} catch {
  process.exit(0); // no stdin — fail open
}

let command = '';
try {
  const payload = JSON.parse(raw.replace(/^﻿/, ''));
  command = (payload && payload.tool_input && payload.tool_input.command) || '';
} catch {
  process.exit(0); // malformed JSON — fail open
}

if (typeof command !== 'string' || !command) process.exit(0);

// Only act on git staging/commit commands; everything else passes through.
if (!/\bgit\s+(add|commit|stash)\b/.test(command)) process.exit(0);

// Bulk-add forms can sweep in a secret without naming it.
const bulkAdd = /\bgit\s+add\s+(-A\b|--all\b|\.(?:\s|$))/.test(command);
const commitAll =
  /\bgit\s+commit\b[^\n]*\s-a[a-zA-Z]*\b/.test(command) ||
  /\bgit\s+commit\b[^\n]*\s--all\b/.test(command);

// Tokenize and test each token as a candidate path.
const tokens = command.split(/\s+/).filter(Boolean);
const secretTokens = tokens.filter((t) => {
  if (t.startsWith('-')) return false; // skip option flags
  const cleaned = t.replace(/^["']|["']$/g, ''); // strip surrounding quotes
  if (!cleaned) return false;
  return isSecretPath(cleaned);
});

if (secretTokens.length) {
  console.error(
    'guard-bash-secrets: BLOCKED — this git command stages a secret file ' +
      `(CLAUDE.md non-negotiable): ${secretTokens.join(', ')}.\n` +
      '  Never commit config.py, *.token, *.secret, or .env files.',
  );
  process.exit(2);
}

if (bulkAdd || commitAll) {
  console.error(
    'guard-bash-secrets: BLOCKED — bulk staging (`git add -A` / `git add .` / ' +
      '`git commit -a`) can sweep in a secret without naming it ' +
      '(CLAUDE.md non-negotiable).\n' +
      '  Stage files explicitly by path instead, then commit.',
  );
  process.exit(2);
}

process.exit(0);
