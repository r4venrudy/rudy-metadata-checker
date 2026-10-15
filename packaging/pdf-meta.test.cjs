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

test('shows subject, keywords and page count when present', () => {
  const { metadata } = pdfMetadata({ Subject: 'Q3 report', Keywords: 'internal, draft', Pages: 12 });
  assert.strictEqual(metadata.Subject, 'Q3 report');
  assert.strictEqual(metadata.Keywords, 'internal, draft');
  assert.strictEqual(metadata.Pages, 12);
  assert.strictEqual(pdfMetadata({}).metadata.Pages, undefined);
});

test('pdfActiveContent finds JavaScript, open actions, launch and embedded files', () => {
  const { pdfActiveContent } = require('./pdf-meta.cjs');
  const pdf = Buffer.from('%PDF-1.7\n1 0 obj << /OpenAction 2 0 R /Names << /EmbeddedFiles 3 0 R >> >>\n2 0 obj << /S /JavaScript /JS (app.alert(1)) >>\n%%EOF', 'latin1');
  assert.deepStrictEqual(pdfActiveContent(pdf), ['JavaScript', 'Automatic action on open', 'Embedded file']);
  assert.deepStrictEqual(pdfActiveContent(Buffer.from('%PDF-1.4\n<< /Type /Catalog /JSON 1 /AAA 2 >>\n%%EOF')), []);
});

test('pdfRevisions counts incremental saves', () => {
  const { pdfRevisions } = require('./pdf-meta.cjs');
  assert.strictEqual(pdfRevisions(Buffer.from('%PDF-1.7\n...\n%%EOF\n')), 1);
  assert.strictEqual(pdfRevisions(Buffer.from('%PDF-1.7\n...\n%%EOF\n1 0 obj\n...\n%%EOF\n')), 2);
});

test('a linearized PDF is not counted as edited', () => {
  const { pdfRevisions } = require('./pdf-meta.cjs');
  assert.strictEqual(pdfRevisions(Buffer.from('%PDF-1.7\n1 0 obj << /Linearized 1 /L 1000 >>\n%%EOF\n2 0 obj\n%%EOF\n')), 1);
});
