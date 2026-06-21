// PreToolUse Write guard: enforce "never overwrite a plan — use <slug>-v2.md"
// (CLAUDE.md / plans workflow). Denies a Write to plans/*.md when the target
// already exists on disk. Exempts *.progress.md and *.revision-requested.md
// (those are written/updated by the executor as part of normal flow).
//
// Exit 0 = allow; exit 2 = deny (stderr fed back to the agent).
// Fails open (exit 0) on malformed/missing stdin.

import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let raw = '';
try {
  raw = readFileSync(0, 'utf8');
} catch {
  process.exit(0); // no stdin — fail open
}

let filePath = '';
try {
  const payload = JSON.parse(raw.replace(/^﻿/, ''));
  filePath = (payload && payload.tool_input && payload.tool_input.file_path) || '';
} catch {
  process.exit(0); // malformed JSON — fail open
}

if (typeof filePath !== 'string' || !filePath) process.exit(0);

const norm = filePath.replace(/\\/g, '/');

// Act only on plans/*.md (directly under plans/). Non-plan writes pass through.
if (!/(^|\/)plans\/[^/]+\.md$/i.test(norm)) process.exit(0);

// Exempt the executor's own bookkeeping files.
if (/\.progress\.md$/i.test(norm) || /\.revision-requested\.md$/i.test(norm)) {
  process.exit(0);
}

const abs = path.isAbsolute(filePath) ? filePath : path.join(root, norm);

if (existsSync(abs)) {
  console.error(
    'guard-plan-overwrite: never overwrite a plan (CLAUDE.md / plans workflow). ' +
      `${norm} already exists; create a new revision (<slug>-v2.md) instead.`,
  );
  process.exit(2);
}

process.exit(0);
