# Revision requested: Safe GitHub release V23

## Required file

`scripts/verify.mjs`

## Why it is required

The approved plan renames `script_v22.js` to `script_v23.js` and requires the
LotTicket verification command `node scripts/verify.mjs` to pass after the
release. The current verifier hard-codes `script_v22.js` for the payout-parity
source and marker checks (around `const JS = path.join(root, 'script_v22.js')`).
After the approved rename, that file is absent and the required gate fails
closed. Retaining a V22 copy would avoid the failure but would violate the
approved rename and the requirement that no V22 runtime asset remain.

## Proposed one-line Key Changes addition

`scripts/verify.mjs`: resolve the payout-parity JavaScript source from the
current asset referenced by `index.html` (or another version-neutral mechanism)
while preserving the existing payout, schedule, and anti-tamper checks.

Implementation is paused until the revised plan is approved.
