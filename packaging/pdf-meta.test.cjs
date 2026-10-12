const test = require('node:test');
const assert = require('node:assert');
const { formatPdfDate, pdfMetadata } = require('./pdf-meta.cjs');

test('formats PDF date strings with time zone', () => {
  assert.strictEqual(formatPdfDate("D:20240102030405+03'00'"), '2024-01-02 03:04:05 UTC+03:00');
  assert.strictEqual(formatPdfDate('D:20240102030405Z'), '2024-01-02 03:04:05 UTC');
  assert.strictEqual(formatPdfDate('D:2024'), '2024-01-01 00:00:00 UTC');
});

test('passes through unknown values and handles missing dates', () => {
  assert.strictEqual(formatPdfDate('yesterday'), 'yesterday');
  assert.strictEqual(formatPdfDate(undefined), 'N/A');
  assert.strictEqual(formatPdfDate(new Date('2020-05-06T07:08:09Z')), '2020-05-06 07:08:09 UTC');
});

test('flags author and software as sensitive', () => {
  const { metadata, sensitive } = pdfMetadata({ Title: 'Report', Author: 'A. Person', Producer: 'Microsoft Word' });
  assert.strictEqual(metadata.Title, 'Report');
  assert.strictEqual(metadata.Creator, 'N/A');
  assert.deepStrictEqual(sensitive, ['Author Name', 'Editing Software']);
  assert.deepStrictEqual(pdfMetadata({}).sensitive, []);
});
