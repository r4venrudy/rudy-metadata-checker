const test = require('node:test');
const assert = require('node:assert');
const { formatField } = require('./format.cjs');

test('renders bullet lines', () => {
  assert.strictEqual(formatField({ Author: 'A', Model: 'X' }), '• Author: A\n• Model: X');
  assert.strictEqual(formatField({}), '');
});

test('never exceeds the field limit and never cuts a line', () => {
  const obj = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`Key${i}`, 'v'.repeat(30)]));
  const out = formatField(obj);
  assert.ok(out.length <= 1024);
  assert.ok(out.endsWith('\n…'));
  for (const line of out.split('\n').slice(0, -1)) assert.match(line, /^• Key\d+: v{30}$/);
});

test('caps a single very long value', () => {
  const out = formatField({ XMP: 'x'.repeat(5000) });
  assert.strictEqual(out.length, 300);
  assert.ok(out.endsWith('…'));
});
