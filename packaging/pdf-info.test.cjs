const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pdfInfo } = require('./pdf-info.cjs');

function fixture() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream',
    '<< /Author (Rudy Offline Fixture) /Title (Package Test) >>'
  ];
  let pdf = '%PDF-1.7\n';
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i+1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += 'xref\n0 6\n0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) pdf += String(offset).padStart(10, '0')+' 00000 n \n';
  pdf += `trailer\n<< /Size 6 /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}
test('PDF v2 reads known author and title offline', async () => {
  const info = await pdfInfo(fixture());
  assert.equal(info.Author, 'Rudy Offline Fixture');
  assert.equal(info.Title, 'Package Test');
});
test('invalid PDF rejects rather than reporting no metadata', async () => {
  await assert.rejects(pdfInfo(Buffer.from('not a PDF')));
});
