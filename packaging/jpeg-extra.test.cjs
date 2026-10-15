const test = require('node:test');
const assert = require('node:assert');
const { jpegComments, jpegIptc } = require('./jpeg-extra.cjs');

function segment(marker, body) {
  const len = Buffer.alloc(2); len.writeUInt16BE(body.length + 2);
  return Buffer.concat([Buffer.from([0xff, marker]), len, body]);
}
function iptc(dataset, text) {
  const v = Buffer.from(text, 'utf8');
  const len = Buffer.alloc(2); len.writeUInt16BE(v.length);
  return Buffer.concat([Buffer.from([0x1c, 2, dataset]), len, v]);
}
function photoshop(iptcBlock) {
  const size = Buffer.alloc(4); size.writeUInt32BE(iptcBlock.length);
  const pad = iptcBlock.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0);
  return Buffer.concat([Buffer.from('Photoshop 3.0\0', 'latin1'), Buffer.from('8BIM', 'latin1'), Buffer.from([0x04, 0x04, 0, 0]), size, iptcBlock, pad]);
}
const SOI = Buffer.from([0xff, 0xd8]);
const SOS = Buffer.from([0xff, 0xda, 0, 2]);

test('reads COM segments', () => {
  const file = Buffer.concat([SOI, segment(0xfe, Buffer.from('CREATOR: gd-jpeg v1.0\0')), SOS]);
  assert.deepEqual(jpegComments(file), ['CREATOR: gd-jpeg v1.0']);
});

test('reads IPTC by-line, city and keywords from APP13', () => {
  const block = Buffer.concat([iptc(80, 'Ayşe Yılmaz'), iptc(90, 'İstanbul'), iptc(25, 'protest'), iptc(25, 'night')]);
  const file = Buffer.concat([SOI, segment(0xed, photoshop(block)), SOS]);
  assert.deepEqual(jpegIptc(file), { 'By-line': 'Ayşe Yılmaz', City: 'İstanbul', Keywords: 'protest, night' });
});

test('files without these segments return nothing', () => {
  const file = Buffer.concat([SOI, segment(0xe0, Buffer.from('JFIF\0')), SOS]);
  assert.deepEqual(jpegComments(file), []);
  assert.deepEqual(jpegIptc(file), {});
});
