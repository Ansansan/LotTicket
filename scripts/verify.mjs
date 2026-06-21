// Mechanical verification of the LotTicket "Don't break this" invariants.
// Usage: node scripts/verify.mjs [root-dir]   (default: repo root)
// Exit 0 = all checks pass (or nothing to check yet); exit 2 = failure, which
// blocks the hook that invoked it and feeds stderr back to Claude.
//
// Two contracts (see CLAUDE.md "Mechanical verification"):
//   1. VERSION-SYNC — BOT_VERSION (lot_ticket.py) === CURRENT_VERSION
//      (index.html); the style_vNN.css / script_vNN.js the page references carry
//      the same NN and exist on disk. (README "Nuclear Cache Busting".)
//   2. PAYOUT-PARITY — the AWARDS table is byte-identical between lot_ticket.py
//      and script_v21.js; the marked // ===PAYOUT-LOGIC-START/END=== block in
//      script_v21.js evaluates as pure JS and reproduces golden payouts.
//
// Anti-tamper: an absent lot_ticket.py fails OPEN (nothing to check); a present
// lot_ticket.py with a referenced asset missing, or a present script_v21.js with
// the PAYOUT-LOGIC markers stripped, fails CLOSED (exit 2) — no vacuous pass.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = process.argv[2] ? path.resolve(process.argv[2]) : repoRoot;

const PY = path.join(root, 'lot_ticket.py');
const HTML = path.join(root, 'index.html');

const failures = [];
let checks = 0;

function finish() {
  if (failures.length) {
    console.error(
      `verify: FAILED (${failures.length} problem${failures.length > 1 ? 's' : ''}, ${checks} checks run)\n` +
        failures.map((m) => `  - ${m}`).join('\n'),
    );
    process.exit(2);
  }
  console.log(`verify: OK (${checks} checks)`);
  process.exit(0);
}

const near = (a, b) => typeof a === 'number' && Math.abs(a - b) < 0.005;
function eq(label, actual, expected) {
  checks++;
  const ok = typeof expected === 'number' ? near(actual, expected) : actual === expected;
  if (!ok) failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function eqSeq(label, actual, expected) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${label}: expected ${e}, got ${a}`);
}
function read(p) {
  return readFileSync(p, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
}
function sortObj(o) {
  return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
}
function parseAwards(src, label) {
  const m = src.match(/AWARDS\s*=\s*\{([\s\S]*?)\}/);
  if (!m) {
    checks++;
    failures.push(`${label}: AWARDS table not found`);
    return null;
  }
  const out = {};
  for (const pair of m[1].matchAll(/['"]([^'"]+)['"]\s*:\s*([\d.]+)/g)) {
    out[pair[1]] = Number(pair[2]);
  }
  return out;
}

// Fail open only when the primary source is absent.
if (!existsSync(PY)) {
  console.log('verify: lot_ticket.py not present — nothing to check (OK)');
  process.exit(0);
}
const py = read(PY);

// ---------------- Contract 1: version-sync ----------------
const pyVer = (py.match(/BOT_VERSION\s*=\s*["']([^"']+)["']/) || [])[1];
checks++;
if (!pyVer) failures.push('lot_ticket.py: BOT_VERSION not found');
const verNum = pyVer && (pyVer.match(/V(\d+)$/i) || [])[1];

if (!existsSync(HTML)) {
  checks++;
  failures.push('index.html missing (referenced by the bot menu URLs)');
} else {
  const html = read(HTML);
  eq('CURRENT_VERSION (index.html) === BOT_VERSION (lot_ticket.py)',
    (html.match(/CURRENT_VERSION\s*=\s*["']([^"']+)["']/) || [])[1], pyVer);

  const cssRef = (html.match(/href=["']([^"']*style_v\d+\.css)["']/) || [])[1];
  const jsRef = (html.match(/src=["']([^"']*script_v\d+\.js)["']/) || [])[1];
  checks++;
  if (!cssRef) failures.push('index.html: style_vNN.css <link> not found');
  checks++;
  if (!jsRef) failures.push('index.html: script_vNN.js <script> not found');

  if (cssRef) {
    eq(`style filename version (${path.basename(cssRef)}) matches ${pyVer}`,
      (cssRef.match(/_v(\d+)\.css$/i) || [])[1], verNum);
    checks++;
    if (!existsSync(path.join(root, path.basename(cssRef)))) {
      failures.push(`referenced ${path.basename(cssRef)} missing on disk`);
    }
  }
  if (jsRef) {
    eq(`script filename version (${path.basename(jsRef)}) matches ${pyVer}`,
      (jsRef.match(/_v(\d+)\.js$/i) || [])[1], verNum);
    checks++;
    if (!existsSync(path.join(root, path.basename(jsRef)))) {
      failures.push(`referenced ${path.basename(jsRef)} missing on disk`);
    }
  }
}

// ---------------- Contract 2: payout-parity ----------------
const JS = path.join(root, 'script_v21.js');
const pyAwards = parseAwards(py, 'lot_ticket.py');
let jsAwards = null;

if (!existsSync(JS)) {
  checks++;
  failures.push('script_v21.js missing (referenced by index.html)');
} else {
  const js = read(JS);
  jsAwards = parseAwards(js, 'script_v21.js');

  if (pyAwards && jsAwards) {
    eqSeq('AWARDS table identical (lot_ticket.py == script_v21.js)', sortObj(pyAwards), sortObj(jsAwards));
    // Non-vacuous anchors — catch a both-sides drift the equality check misses.
    eq('AWARDS 2_digit_1 == 14', jsAwards['2_digit_1'], 14);
    eq('AWARDS 4_digit_12 == 1000', jsAwards['4_digit_12'], 1000);
    eq('AWARDS 4_digit_23 == 200', jsAwards['4_digit_23'], 200);
  }

  const block = js.match(/\/\/ ===PAYOUT-LOGIC-START===([\s\S]*?)\/\/ ===PAYOUT-LOGIC-END===/);
  checks++;
  if (!block) {
    failures.push('script_v21.js has no // ===PAYOUT-LOGIC-START/END=== block (anti-tamper contract)');
  } else if (jsAwards) {
    let calc;
    try {
      calc = new Function(
        `"use strict";const AWARDS=${JSON.stringify(jsAwards)};${block[1]}\nreturn calculateTicketWin;`,
      )();
    } catch (e) {
      failures.push(`payout block did not evaluate as pure JS: ${e.message}`);
    }
    if (typeof calc === 'function') {
      const t = (items, res, type) => calc(items, res, type).total;
      // Standard lotteries (Tica/Nica/Primera): AWARDS-table driven, stacked.
      eq('standard 2-digit w1 -> 14', t([{ num: '12', qty: 1 }], { w1: '12', w2: '34', w3: '56' }, 'Tica 1:00 pm'), 14);
      eq('standard 2-digit bet x5 -> 70', t([{ num: '12', qty: 5 }], { w1: '12', w2: '00', w3: '00' }, 'Tica 1:00 pm'), 70);
      eq('standard 4-digit 1ro/2do -> 1000', t([{ num: '1234', qty: 1 }], { w1: '12', w2: '34', w3: '56' }, 'Tica 1:00 pm'), 1000);
      eq('standard no match -> 0', t([{ num: '77', qty: 1 }], { w1: '12', w2: '34', w3: '56' }, 'Tica 1:00 pm'), 0);
      // Nacional (Panama rules): 2-digit on last-2 of a winner.
      eq('nacional 2-digit last2 of w1 -> 14', t([{ num: '34', qty: 1 }], { w1: '1234', w2: '5678', w3: '9012' }, 'Nacional 3:00 pm'), 14);
      // Nacional 4-digit "best prize wins" (frontend rule; Python stacks — a
      // documented divergence, NOT asserted equal across languages).
      eq('nacional 4-digit exact w1 -> 2000', t([{ num: '1234', qty: 1 }], { w1: '1234', w2: '0000', w3: '0001' }, 'Nacional 3:00 pm'), 2000);
      eq('nacional best-only picks 600 over 3', t([{ num: '1299', qty: 1 }], { w1: '1234', w2: '1299', w3: '0000' }, 'Nacional 3:00 pm'), 600);
    }
  }
}

finish();
