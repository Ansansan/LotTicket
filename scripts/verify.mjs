// Mechanical verification of the LotTicket "Don't break this" invariants.
// Usage: node scripts/verify.mjs [root-dir]   (default: repo root)
// Exit 0 = all checks pass (or nothing to check yet); exit 2 = failure, which
// blocks the hook that invoked it and feeds stderr back to Claude.
//
// Four contracts (see CLAUDE.md "Mechanical verification"):
//   1. VERSION-SYNC — BOT_VERSION (lot_ticket.py) === CURRENT_VERSION
//      (index.html); the style_vNN.css / script_vNN.js the page references carry
//      the same NN, carry a matching ?v= query token, and exist on disk.
//      (README "Nuclear Cache Busting".)
//   2. PAYOUT-PARITY — the AWARDS table is byte-identical between lot_ticket.py
//      and the current script referenced by index.html; its marked
//      // ===PAYOUT-LOGIC-START/END=== block evaluates as pure JS and reproduces
//      golden payouts.
//   3. DRAW-SCHEDULE — Nica runs at noon daily; its 7pm draw appears only on
//      weekends. The retired 1pm label remains history-only.
//   4. DATE-AWARE-CONSUMERS — purchase, admin, and stats views in both web apps
//      must obtain standard lotteries through getStandardLotteriesForDate().
//
// Anti-tamper: an absent lot_ticket.py fails OPEN (nothing to check); a present
// lot_ticket.py with a referenced asset missing, or a present current script
// with the PAYOUT-LOGIC markers stripped, fails CLOSED (exit 2) — no vacuous
// pass.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = process.argv[2] ? path.resolve(process.argv[2]) : repoRoot;

const PY = path.join(root, 'lot_ticket.py');
const HTML = path.join(root, 'index.html');
let currentScriptName = null;

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

function isCodePosition(src, target) {
  let state = null;
  for (let i = 0; i < target; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (state === 'line-comment') {
      if (ch === '\n') state = null;
      continue;
    }
    if (state === 'block-comment') {
      if (ch === '*' && next === '/') {
        state = null;
        i++;
      }
      continue;
    }
    if (state === 'single-quote' || state === 'double-quote' || state === 'template') {
      if (ch === '\\') {
        i++;
      } else if ((state === 'single-quote' && ch === "'") ||
                 (state === 'double-quote' && ch === '"') ||
                 (state === 'template' && ch === '`')) {
        state = null;
      }
      continue;
    }
    if (ch === '/' && next === '/') {
      state = 'line-comment';
      i++;
    } else if (ch === '/' && next === '*') {
      state = 'block-comment';
      i++;
    } else if (ch === "'") {
      state = 'single-quote';
    } else if (ch === '"') {
      state = 'double-quote';
    } else if (ch === '`') {
      state = 'template';
    }
  }
  return state === null;
}

function maskNonCode(src) {
  const chars = src.split('');
  let state = null;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const next = chars[i + 1];
    if (state === 'line-comment') {
      if (ch !== '\n') chars[i] = ' ';
      if (ch === '\n') state = null;
      continue;
    }
    if (state === 'block-comment') {
      if (ch !== '\n') chars[i] = ' ';
      if (ch === '*' && next === '/') {
        chars[i + 1] = ' ';
        state = null;
        i++;
      }
      continue;
    }
    if (state === 'single-quote' || state === 'double-quote' || state === 'template') {
      if (ch !== '\n') chars[i] = ' ';
      if (ch === '\\') {
        if (chars[i + 1] !== '\n') chars[i + 1] = ' ';
        i++;
      } else if ((state === 'single-quote' && ch === "'") ||
                 (state === 'double-quote' && ch === '"') ||
                 (state === 'template' && ch === '`')) {
        state = null;
      }
      continue;
    }
    if (ch === '/' && next === '/') {
      chars[i] = ' ';
      chars[i + 1] = ' ';
      state = 'line-comment';
      i++;
    } else if (ch === '/' && next === '*') {
      chars[i] = ' ';
      chars[i + 1] = ' ';
      state = 'block-comment';
      i++;
    } else if (ch === "'") {
      chars[i] = ' ';
      state = 'single-quote';
    } else if (ch === '"') {
      chars[i] = ' ';
      state = 'double-quote';
    } else if (ch === '`') {
      chars[i] = ' ';
      state = 'template';
    }
  }
  return chars.join('');
}

function findBalancedEnd(src, openIndex, openChar, closeChar) {
  let depth = 0;
  let state = null;
  for (let i = openIndex; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (state === 'line-comment') {
      if (ch === '\n') state = null;
      continue;
    }
    if (state === 'block-comment') {
      if (ch === '*' && next === '/') {
        state = null;
        i++;
      }
      continue;
    }
    if (state === 'single-quote' || state === 'double-quote' || state === 'template') {
      if (ch === '\\') {
        i++;
      } else if ((state === 'single-quote' && ch === "'") ||
                 (state === 'double-quote' && ch === '"') ||
                 (state === 'template' && ch === '`')) {
        state = null;
      }
      continue;
    }
    if (ch === '/' && next === '/') {
      state = 'line-comment';
      i++;
    } else if (ch === '/' && next === '*') {
      state = 'block-comment';
      i++;
    } else if (ch === "'") {
      state = 'single-quote';
    } else if (ch === '"') {
      state = 'double-quote';
    } else if (ch === '`') {
      state = 'template';
    } else if (ch === openChar) {
      depth++;
    } else if (ch === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findFunctionBodySpans(src) {
  const spans = [];
  const functionPattern = /\bfunction(?:\s+([A-Za-z_$][\w$]*))?\s*\(/g;
  for (const match of src.matchAll(functionPattern)) {
    if (!isCodePosition(src, match.index)) continue;
    let name = match[1];
    if (!name) {
      const assignment = src.slice(0, match.index).match(/(?:^|[;{}\n])\s*(?:[A-Za-z_$][\w$]*\.)*([A-Za-z_$][\w$]*)\s*=\s*$/);
      name = assignment?.[1] || '<anonymous>';
    }
    const openParen = match.index + match[0].lastIndexOf('(');
    const closeParen = findBalancedEnd(src, openParen, '(', ')');
    if (closeParen < 0) continue;
    let bodyOpen = closeParen + 1;
    while (/\s/.test(src[bodyOpen] || '')) bodyOpen++;
    if (src[bodyOpen] !== '{') continue;
    const bodyClose = findBalancedEnd(src, bodyOpen, '{', '}');
    if (bodyClose < 0) continue;
    spans.push({ name, start: bodyOpen, end: bodyClose });
  }
  return spans;
}

function findLegacyDeclaration(src) {
  return src.match(/const LEGACY_LOTTERIES\s*=\s*\[[\s\S]*?\];/);
}

function legacyReferenceIssues(src, label, declaration) {
  const declarationNameIndex = declaration.index + declaration[0].indexOf('LEGACY_LOTTERIES');
  const code = maskNonCode(src);
  const uses = [...code.matchAll(/\bLEGACY_LOTTERIES\b/g)].map((match) => match.index);
  const nonDeclarationUses = uses.filter((index) => index !== declarationNameIndex);
  const historyHelpers = new Set(['getHistoryLotteryTypes', 'getLotteryMetaFromType']);
  const spans = findFunctionBodySpans(src);
  const issues = [];
  if (nonDeclarationUses.length < 2) {
    issues.push(`${label}: LEGACY_LOTTERIES history references are incomplete`);
  }
  for (const index of nonDeclarationUses) {
    const containing = spans.filter((span) => index > span.start && index < span.end);
    if (containing.length !== 1 || !historyHelpers.has(containing[0]?.name)) {
      issues.push(`${label}: LEGACY_LOTTERIES must be referenced only by history helpers (offset ${index})`);
    }
  }
  return issues;
}

function verifyLegacyHistoryCompatibility(src, label) {
  const declaration = findLegacyDeclaration(src);
  checks++;
  if (!declaration || !/name:\s*["']Nica["'][\s\S]*?time:\s*["']1:00 pm["']/.test(declaration[0])) {
    failures.push(`${label}: retired Nica 1:00 pm history label is missing`);
    return;
  }

  checks++;
  failures.push(...legacyReferenceIssues(src, label, declaration));

  const outsideDeclaration = `${src.slice(0, declaration.index)}${src.slice(declaration.index + declaration[0].length)}`;
  checks++;
  if (/1:00 pm/.test(outsideDeclaration)) {
    failures.push(`${label}: retired Nica 1:00 pm label appears outside LEGACY_LOTTERIES`);
  }

  const topLevelAliasMutation = `${src}\nconst ACTIVE_LOTTERIES = LEGACY_LOTTERIES;\n`;
  eq(`${label}: top-level legacy alias mutation is rejected`,
    legacyReferenceIssues(topLevelAliasMutation, label, findLegacyDeclaration(topLevelAliasMutation)).length > 0,
    true);
}

const DATE_AWARE_CONSUMERS = [
  {
    kind: 'purchase',
    name: 'renderLotteryGridForDate',
    expression: /\bconst\s+standardLotteries\s*=\s*getStandardLotteriesForDate\s*\(\s*dateStr\s*\)/,
  },
  {
    kind: 'admin',
    name: 'populateAdminSelect',
    expression: /\bconst\s+allLotteries\s*=\s*\[\.\.\.getStandardLotteriesForDate\s*\(\s*dateStr\s*\)\s*,\s*NACIONAL_LOTTERY\s*\]/,
  },
  {
    kind: 'stats',
    name: 'selectStatsDate',
    expression: /\bconst\s+all\s*=\s*\[\.\.\.getStandardLotteriesForDate\s*\(\s*dateStr\s*\)\s*,\s*NACIONAL_LOTTERY\s*\]/,
  },
];

function standardReferenceIssues(src, label) {
  const code = maskNonCode(src);
  const declaration = code.match(/\bconst\s+STANDARD_LOTTERIES\s*=/);
  const helperSpans = findFunctionBodySpans(src).filter((span) => span.name === 'getStandardLotteriesForDate');
  const historyHelpers = new Set(['getHistoryLotteryTypes', 'getLotteryMetaFromType']);
  const issues = [];
  if (!declaration) {
    return [`${label}: STANDARD_LOTTERIES declaration is missing`];
  }
  if (helperSpans.length !== 1) {
    issues.push(`${label}: getStandardLotteriesForDate must have exactly one function body`);
  }
  const declarationNameIndex = declaration.index + declaration[0].indexOf('STANDARD_LOTTERIES');
  const spans = findFunctionBodySpans(src);
  for (const match of code.matchAll(/\bSTANDARD_LOTTERIES\b/g)) {
    const index = match.index;
    if (index === declarationNameIndex) continue;
    const containing = spans.filter((span) => index > span.start && index < span.end);
    const inDateHelper = containing.some((span) => span.name === 'getStandardLotteriesForDate');
    const inHistoryHelper = containing.length === 1 && historyHelpers.has(containing[0].name);
    const isDirectHistorySpread = inHistoryHelper && code.slice(Math.max(0, index - 3), index) === '...';
    if (!inDateHelper && !isDirectHistorySpread) {
      issues.push(`${label}: STANDARD_LOTTERIES reference outside declaration/date-aware or history helper (offset ${index})`);
    }
  }
  return issues;
}

function dateAwareConsumerIssues(src, label) {
  const spans = findFunctionBodySpans(src);
  const issues = [];
  const code = maskNonCode(src);
  for (const consumer of DATE_AWARE_CONSUMERS) {
    const { kind, name } = consumer;
    const matches = spans.filter((span) => span.name === name);
    if (matches.length !== 1) {
      issues.push(`${label}: ${kind} consumer ${name} must have exactly one function body`);
      continue;
    }
    const body = code.slice(matches[0].start + 1, matches[0].end);
    if (!consumer.expression.test(body)) {
      issues.push(`${label}: ${kind} consumer ${name} lacks its date-aware schedule expression`);
    }
    if (/\bSTANDARD_LOTTERIES\b/.test(body)) {
      issues.push(`${label}: ${kind} consumer ${name} directly references STANDARD_LOTTERIES`);
    }
  }
  return issues;
}

function verifyDateAwareConsumers(src, label) {
  checks++;
  failures.push(...standardReferenceIssues(src, label));
  checks++;
  failures.push(...dateAwareConsumerIssues(src, label));

  for (const consumer of DATE_AWARE_CONSUMERS) {
    const spans = findFunctionBodySpans(src).filter((span) => span.name === consumer.name);
    let mutated = null;
    if (spans.length === 1) {
      const bodyStart = spans[0].start + 1;
      const body = src.slice(bodyStart, spans[0].end);
      const bodyCode = maskNonCode(body);
      const call = bodyCode.match(/\bgetStandardLotteriesForDate\s*\(\s*dateStr\s*\)/);
      if (call) {
        const callStart = bodyStart + call.index;
        const callEnd = callStart + call[0].length;
        mutated = `${src.slice(0, callStart)}ACTIVE_STANDARD /* getStandardLotteriesForDate() */${src.slice(callEnd)}\nconst ACTIVE_STANDARD = STANDARD_LOTTERIES;\n`;
      }
    }
    let mutationRejected = false;
    if (mutated) {
      try {
        new Function(mutated);
        mutationRejected = dateAwareConsumerIssues(mutated, label).length > 0 ||
          standardReferenceIssues(mutated, label).length > 0;
      } catch {
        mutationRejected = false;
      }
    }
    eq(`${label}: ${consumer.kind} alias/comment bypass mutation is rejected`, mutationRejected, true);
  }
}

function verifyDrawSchedule(src, label) {
  const block = src.match(/const STANDARD_LOTTERIES\s*=\s*\[([\s\S]*?)\];/);
  checks++;
  if (!block) {
    failures.push(`${label}: STANDARD_LOTTERIES table not found`);
    verifyLegacyHistoryCompatibility(src, label);
    verifyDateAwareConsumers(src, label);
    return;
  }

  const lotteries = [...block[1].matchAll(
    /\{\s*id:\s*["']([^"']+)["'],\s*name:\s*["']([^"']+)["'],\s*time:\s*["']([^"']+)["']/g,
  )].map((m) => ({ id: m[1], name: m[2], time: m[3] }));
  const labels = (entries) => entries.map((lot) => `${lot.name} ${lot.time}`);
  const expectedWeekend = [
    'La Primera 11:00 am',
    'Nica 12:00 m',
    'Tica 1:55 pm',
    'Nica 4:00 pm',
    'Tica 5:30 pm',
    'La Primera 6:00 pm',
    'Nica 7:00 pm',
    'Tica 8:30 pm',
    'Nica 10:00 pm',
  ];
  const expectedWeekday = expectedWeekend.filter((lottery) => lottery !== 'Nica 7:00 pm');
  eqSeq(`${label}: current master schedule`, labels(lotteries), expectedWeekend);

  const helper = src.match(/function getStandardLotteriesForDate\(dateStr\) \{[\s\S]*?\n\}/);
  checks++;
  if (!helper) {
    failures.push(`${label}: getStandardLotteriesForDate helper not found`);
    verifyLegacyHistoryCompatibility(src, label);
    verifyDateAwareConsumers(src, label);
    return;
  }

  try {
    const scheduleFor = new Function(
      'STANDARD_LOTTERIES',
      `"use strict";${helper[0]};return getStandardLotteriesForDate;`,
    )(lotteries);
    const week = [
      ['Sunday', '2026-08-16'],
      ['Monday', '2026-08-17'],
      ['Tuesday', '2026-08-18'],
      ['Wednesday', '2026-08-19'],
      ['Thursday', '2026-08-20'],
      ['Friday', '2026-08-21'],
      ['Saturday', '2026-08-22'],
    ];
    for (const [day, dateStr] of week) {
      const expected = day === 'Saturday' || day === 'Sunday' ? expectedWeekend : expectedWeekday;
      eqSeq(`${label}: ${day} schedule`, labels(scheduleFor(dateStr)), expected);
    }
    eq(`${label}: Sunday Nica 7pm enabled`,
      scheduleFor('2026-08-16').some((lottery) => lottery.id === 'nica_7'), true);
    eq(`${label}: Saturday Nica 7pm enabled`,
      scheduleFor('2026-08-22').some((lottery) => lottery.id === 'nica_7'), true);
  } catch (e) {
    failures.push(`${label}: draw schedule helper did not evaluate: ${e.message}`);
  }

  verifyLegacyHistoryCompatibility(src, label);
  verifyDateAwareConsumers(src, label);
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

  const cssUrl = (html.match(/href=["']([^"']*style_v\d+\.css(?:\?[^"']*)?)["']/) || [])[1];
  const jsUrl = (html.match(/src=["']([^"']*script_v\d+\.js(?:\?[^"']*)?)["']/) || [])[1];
  const cssRef = cssUrl && cssUrl.split('?')[0];
  const jsRef = jsUrl && jsUrl.split('?')[0];
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
    const cssQuery = new URLSearchParams((cssUrl.split('?')[1] || ''));
    eq(`style cache query (${path.basename(cssRef)}) matches ${pyVer}`, cssQuery.get('v'), pyVer);
  }
  if (jsRef) {
    currentScriptName = path.basename(jsRef);
    eq(`script filename version (${path.basename(jsRef)}) matches ${pyVer}`,
      (jsRef.match(/_v(\d+)\.js$/i) || [])[1], verNum);
    checks++;
    if (!existsSync(path.join(root, path.basename(jsRef)))) {
      failures.push(`referenced ${path.basename(jsRef)} missing on disk`);
    }
    const jsQuery = new URLSearchParams((jsUrl.split('?')[1] || ''));
    eq(`script cache query (${path.basename(jsRef)}) matches ${pyVer}`, jsQuery.get('v'), pyVer);
  }
}

// ---------------- Contract 2: payout-parity ----------------
const currentScriptLabel = currentScriptName || 'current script';
const JS = currentScriptName ? path.join(root, currentScriptName) : null;
const pyAwards = parseAwards(py, 'lot_ticket.py');
let jsAwards = null;

if (!JS || !existsSync(JS)) {
  checks++;
  failures.push(`${currentScriptLabel} missing (referenced by index.html)`);
} else {
  const js = read(JS);
  verifyDrawSchedule(js, currentScriptLabel);
  jsAwards = parseAwards(js, currentScriptLabel);

  if (pyAwards && jsAwards) {
    eqSeq('AWARDS table identical (lot_ticket.py == current script)', sortObj(pyAwards), sortObj(jsAwards));
    // Non-vacuous anchors — catch a both-sides drift the equality check misses.
    // All 6 keys anchored so no key can be co-edited to a wrong value undetected.
    eq('AWARDS 2_digit_1 == 14', jsAwards['2_digit_1'], 14);
    eq('AWARDS 2_digit_2 == 3', jsAwards['2_digit_2'], 3);
    eq('AWARDS 2_digit_3 == 2', jsAwards['2_digit_3'], 2);
    eq('AWARDS 4_digit_12 == 1000', jsAwards['4_digit_12'], 1000);
    eq('AWARDS 4_digit_13 == 1000', jsAwards['4_digit_13'], 1000);
    eq('AWARDS 4_digit_23 == 200', jsAwards['4_digit_23'], 200);
  }

  const block = js.match(/\/\/ ===PAYOUT-LOGIC-START===([\s\S]*?)\/\/ ===PAYOUT-LOGIC-END===/);
  checks++;
  if (!block) {
    failures.push(`${currentScriptLabel} has no // ===PAYOUT-LOGIC-START/END=== block (anti-tamper contract)`);
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
      // Guard the golden calls: if the marked block ever references a symbol
      // defined outside the markers, calc() throws — catch it as a controlled
      // failure (exit 2, blocking) instead of an uncaught throw (exit 1, which a
      // Stop hook treats as non-blocking and would let a broken payout edit pass).
      try {
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
      } catch (e) {
        checks++;
        failures.push(`payout golden cases threw (block references a symbol outside the markers?): ${e.message}`);
      }
    }
  }
}

const DADAN_JS = path.join(root, 'dadan', 'script.js');
checks++;
if (!existsSync(DADAN_JS)) {
  failures.push('dadan/script.js missing');
} else {
  verifyDrawSchedule(read(DADAN_JS), 'dadan/script.js');
}

finish();
