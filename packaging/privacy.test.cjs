const test = require('node:test');
const assert = require('node:assert');
const { privateByDefault } = require('./privacy.cjs');

test('keeps metadata private unless the user explicitly opts into a public reply', () => {
  assert.strictEqual(privateByDefault(null), true);
  assert.strictEqual(privateByDefault(undefined), true);
  assert.strictEqual(privateByDefault(true), true);
  assert.strictEqual(privateByDefault(false), false);
});
