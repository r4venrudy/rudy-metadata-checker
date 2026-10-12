const test = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');
const { pngMetadata } = require('./png-meta.cjs');

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]); // CRC is not checked
}

function png(...chunks) {
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunks, chunk('IEND', Buffer.alloc(0))]);
}

test('reads tEXt, zTXt and iTXt chunks', () => {
  const buf = png(
    chunk('tEXt', Buffer.from('Software\0GIMP 2.10', 'latin1')),
    chunk('zTXt', Buffer.concat([Buffer.from('Author\0\0', 'latin1'), zlib.deflateSync('Jane Doe')])),
    chunk('iTXt', Buffer.from('Description\0\0\0tr\0\0Ekran görüntüsü', 'utf8'))
  );
  const { metadata, sensitive } = pngMetadata(buf);
  assert.deepStrictEqual(metadata, { Software: 'GIMP 2.10', Author: 'Jane Doe', Description: 'Ekran görüntüsü' });
  assert.deepStrictEqual(sensitive, ['Author Name', 'Editing Software']);
});

test('PNG without text chunks', () => {
  assert.deepStrictEqual(pngMetadata(png()).metadata, { PNG: 'No text metadata chunks found' });
});

test('rejects non-PNG data', () => {
  assert.throws(() => pngMetadata(Buffer.from('nope')), /Not a PNG/);
});
