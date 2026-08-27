import assert from 'node:assert/strict';
import {
  isSecretPath,
  scanContentForSecrets,
} from './secret-patterns.mjs';

const syncKey = ['TICKET_SYNC', 'SECRET'].join('_');
const realValue = ['a-real', 'shared-secret'].join('-');

assert.equal(
  scanContentForSecrets(`${syncKey} = "REPLACE_ME"`),
  false,
  'the tracked config placeholder must remain allowed',
);
assert.equal(
  scanContentForSecrets(`${syncKey} = "${realValue}"`),
  true,
  'a real shared sync secret assignment must be rejected',
);
assert.equal(
  scanContentForSecrets(`{"${syncKey}":"${realValue}"}`),
  true,
  'JSON-style shared sync secret assignments must be rejected',
);
assert.equal(
  scanContentForSecrets(`const key = process.env.${syncKey};`),
  false,
  'an environment lookup without a literal must remain allowed',
);
assert.equal(isSecretPath('config.py'), true);
assert.equal(isSecretPath('ticket_sync.py'), false);

console.log('secret-patterns: OK');
