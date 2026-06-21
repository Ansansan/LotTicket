// CI secret backstop: scan ALL tracked files for a secret path or secret
// content. Server-side complement to the per-clone git pre-commit hook
// (scripts/check-staged-secrets.mjs), which only fires if a dev actually ran
// `git config core.hooksPath scripts/git-hooks`. This step runs in CI on every
// PR and push, so a secret committed from an unguarded clone is still caught.
//
// Exit 0 = clean; exit 1 = secret found. Fails open on a git/IO error so an
// infra hiccup never wedges CI.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isSecretPath, scanContentForSecrets } from './secret-patterns.mjs';

let tracked;
try {
  const out = spawnSync('git', ['ls-files'], { encoding: 'utf8' }).stdout || '';
  tracked = out.split('\n').map((l) => l.trim()).filter(Boolean);
} catch {
  console.log('check-tracked-secrets: could not list tracked files — skipping (OK)');
  process.exit(0);
}

const pathHits = tracked.filter(isSecretPath);
const contentHits = [];
for (const p of tracked) {
  if (isSecretPath(p)) continue; // already a path hit
  try {
    if (scanContentForSecrets(readFileSync(p, 'utf8'))) contentHits.push(p);
  } catch {
    // Unreadable / binary file — skip (the content regex can't match it).
  }
}

if (pathHits.length || contentHits.length) {
  const lines = ['check-tracked-secrets: SECRET DETECTED IN TRACKED FILES (CLAUDE.md non-negotiable).'];
  if (pathHits.length) {
    lines.push('  Secret file path(s):');
    for (const p of pathHits) lines.push(`    - ${p}`);
  }
  if (contentHits.length) {
    lines.push('  Credential content (Telegram TOKEN / SECURITY_SALT):');
    for (const p of contentHits) lines.push(`    - ${p}`);
  }
  lines.push('  Remove these from the repo, rotate the leaked credential, and purge from history.');
  console.error(lines.join('\n'));
  process.exit(1);
}

console.log(`check-tracked-secrets: OK (scanned ${tracked.length} tracked files, no secrets)`);
process.exit(0);
