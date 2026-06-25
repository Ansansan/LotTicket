// Pin the LotTicket "Don't break this" invariant surfaces against a committed
// golden snapshot (scripts/locked-snapshot.json). Drift -> exit 2 with a
// per-surface hint. A deliberate, approved change is acknowledged with
//   node scripts/check-locked.mjs --update
// which regenerates the snapshot; commit the snapshot diff in the same PR.
//
// Surfaces (see CLAUDE.md "Don't break this"):
//   - version           BOT_VERSION token
//   - awards            the 6 AWARDS key/value pairs
//   - adminGroupId      ADMIN_GROUP_ID
//   - adminUserId       ADMIN_USER_ID
//   - topicMapping      TOPIC_MAPPING { name: thread_id }
//   - nacionalWeekdays  the weekday() set auto-marked Nacional (Wed=2, Sun=6)
//   - nacionalWindowDays  the look-ahead window (30 days)
//   - nacionalTiers     the Nacional billete prize constants (set)
//   - adminGateOnSaveResults  the save_results branch keeps its admin check
//   - adminGateOnRefreshMenu  the "Actualizar" handler routes to the admin menu
//                             only behind an ADMIN_USER_ID/ADMIN_GROUP_ID check
//   - secSaltCoupling   the SEC code + guilloche seed both derive from the
//                       SECURITY_SALT imported from config (not a literal)
//
// CRLF->LF + BOM normalize on read so Windows and CI agree. Exit 0 = match.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const root = rootArg ? path.resolve(rootArg) : path.resolve(here, '..');
const SNAP = path.join(here, 'locked-snapshot.json');
const PY = path.join(root, 'lot_ticket.py');

function read(p) {
  return readFileSync(p, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
}

function extract() {
  const py = read(PY);
  const o = {};

  o.version = (py.match(/BOT_VERSION\s*=\s*["']([^"']+)["']/) || [])[1] || null;

  const awards = {};
  const am = py.match(/AWARDS\s*=\s*\{([\s\S]*?)\}/);
  if (am) for (const p of am[1].matchAll(/['"]([^'"]+)['"]\s*:\s*([\d.]+)/g)) awards[p[1]] = Number(p[2]);
  o.awards = Object.fromEntries(Object.keys(awards).sort().map((k) => [k, awards[k]]));

  o.adminGroupId = (py.match(/ADMIN_GROUP_ID\s*=\s*(-?\d+)/) || [])[1] || null;
  o.adminUserId = (py.match(/ADMIN_USER_ID\s*=\s*(-?\d+)/) || [])[1] || null;

  const topic = {};
  const tm = py.match(/TOPIC_MAPPING\s*=\s*\{([^}]*)\}/);
  if (tm) for (const p of tm[1].matchAll(/["']([^"']+)["']\s*:\s*(\d+)/g)) topic[p[1]] = Number(p[2]);
  o.topicMapping = Object.fromEntries(Object.keys(topic).sort().map((k) => [k, topic[k]]));

  const wd = py.match(/weekday\(\)\s*in\s*\(([^)]*)\)/);
  o.nacionalWeekdays = wd ? wd[1].split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b) : [];

  o.nacionalWindowDays = Number((py.match(/range\(\s*0\s*,\s*(\d+)\s*\)/) || [])[1]) || null;

  // Capture every Nacional prize `amount = N` literal in SOURCE ORDER (no Set,
  // no sort). Collapsing into a sorted set hid a permutation among existing
  // values (e.g. swapping the 2do/3er Exacto 600 <-> 300); an ordered sequence
  // changes when any tier is permuted or retuned, so the pin actually detects it.
  o.nacionalTiers = [...py.matchAll(/amount\s*=\s*([\d.]+)/g)].map((p) => Number(p[1]));

  // Assert the ACTUAL admin guard, not just that the id names appear nearby:
  // within the save_results branch there must be a `!= str(ADMIN_USER_ID) ...
  // != str(ADMIN_GROUP_ID):` test whose branch body begins with `return`.
  // Replacing that `return` with `pass`, or deleting the guard, now fails here.
  o.adminGateOnSaveResults =
    /save_results'[\s\S]{0,200}!=\s*str\(ADMIN_USER_ID\)[\s\S]{0,80}!=\s*str\(ADMIN_GROUP_ID\)\s*:\s*return\b/.test(py);

  // The "Actualizar" handler must route to send_admin_main_menu only behind an
  // admin check: both ADMIN ids appear in the function body and at least one of
  // them precedes the send_admin_main_menu call.
  const refreshBody = (py.match(/def\s+refresh_user_main_menu[\s\S]*?(?=\n@bot|\ndef\s)/) || [])[0] || '';
  const idPos = Math.min(
    ...['ADMIN_GROUP_ID', 'ADMIN_USER_ID'].map((id) => {
      const i = refreshBody.indexOf(id);
      return i === -1 ? Infinity : i;
    }),
  );
  const sendPos = refreshBody.indexOf('send_admin_main_menu');
  o.adminGateOnRefreshMenu =
    /ADMIN_GROUP_ID/.test(refreshBody) &&
    /ADMIN_USER_ID/.test(refreshBody) &&
    sendPos !== -1 &&
    idPos < sendPos;

  // SEC code (sha256 seed) and guilloche RNG seed both derive from the same
  // SECURITY_SALT, which must be imported from config (no literal assignment).
  o.secSaltCoupling = {
    secCodeSeed: /f"\{ticket_id\}-\{SECURITY_SALT\}"/.test(py),
    guillocheSeed: /f"\{ticket_id\}_\{SECURITY_SALT\}"/.test(py),
    saltFromConfig:
      /from\s+config\s+import\b[^\n]*\bSECURITY_SALT\b/.test(py) &&
      !/^\s*SECURITY_SALT\s*=\s*["']/m.test(py),
  };

  return o;
}

if (!existsSync(PY)) {
  console.log('check-locked: lot_ticket.py not present — nothing to check (OK)');
  process.exit(0);
}

const current = extract();

if (process.argv.includes('--update')) {
  writeFileSync(SNAP, JSON.stringify(current, null, 2) + '\n');
  console.log(`check-locked: snapshot updated (${SNAP})`);
  process.exit(0);
}

if (!existsSync(SNAP)) {
  console.error('check-locked: no snapshot — run `node scripts/check-locked.mjs --update` once to create it.');
  process.exit(2);
}

const expected = JSON.parse(read(SNAP));
const drift = [];
const keys = [...new Set([...Object.keys(expected), ...Object.keys(current)])];
for (const k of keys) {
  if (JSON.stringify(current[k]) !== JSON.stringify(expected[k])) {
    drift.push(`  - ${k}: expected ${JSON.stringify(expected[k])}, got ${JSON.stringify(current[k])}`);
  }
}

if (drift.length) {
  console.error(
    'check-locked: DRIFT — a locked invariant changed (CLAUDE.md "Don\'t break this").\n' +
      drift.join('\n') +
      '\n  If deliberate and approved: `node scripts/check-locked.mjs --update` and commit the snapshot.',
  );
  process.exit(2);
}

console.log(`check-locked: OK (${keys.length} surfaces)`);
process.exit(0);
