// Git pre-commit entry: abort the commit if any staged file is a secret
// (by path) or carries credential content (CLAUDE.md non-negotiable).
//
// Invoked from scripts/git-hooks/pre-commit. Catches every commit path —
// manual git, IDE, or Claude — because it runs inside git itself.
//
// Exit 0 = clean (allow commit); exit 1 = secret detected (abort commit).
// Fails open on a git/IO error so it never wedges legitimate commits.

import { spawnSync } from 'node:child_process';
import { isSecretPath, scanContentForSecrets } from './secret-patterns.mjs';

function git(...args) {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

let stagedPaths;
try {
  const out = git('diff', '--cached', '--name-only', '--diff-filter=ACM').stdout;
  stagedPaths = out.split('\n').map((l) => l.trim()).filter(Boolean);
} catch {
  process.exit(0); // can't enumerate the staged set — fail open
}

const pathHits = [];
const contentHits = [];

for (const p of stagedPaths) {
  if (isSecretPath(p)) {
    pathHits.push(p);
    continue; // already blocked by path; no need to scan content
  }
  try {
    const r = git('show', `:${p}`);
    if (r.status === 0 && scanContentForSecrets(r.stdout)) {
      contentHits.push(p);
    }
  } catch {
    // Fail open on a per-file read error — skip this file, keep checking.
  }
}

if (pathHits.length || contentHits.length) {
  const lines = ['check-staged-secrets: COMMIT BLOCKED — staged secret detected (CLAUDE.md non-negotiable).'];
  if (pathHits.length) {
    lines.push('  Secret file path(s):');
    for (const p of pathHits) lines.push(`    - ${p}`);
  }
  if (contentHits.length) {
    lines.push('  Credential content (Telegram TOKEN / SECURITY_SALT):');
    for (const p of contentHits) lines.push(`    - ${p}`);
  }
  lines.push('  Unstage these before committing: `git restore --staged <file>`.');
  console.error(lines.join('\n'));
  process.exit(1);
}

process.exit(0);
