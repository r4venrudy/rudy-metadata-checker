const test = require('node:test');
const assert = require('node:assert');
const exif = require('exif-parser');
const { isWebp, webpChunks, tiffAsJpeg } = require('./webp-meta.cjs');

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32LE(data.length);
  const pad = data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0);
  return Buffer.concat([Buffer.from(type, 'latin1'), len, data, pad]);
}

function webp(...chunks) {
  const body = Buffer.concat([Buffer.from('WEBP', 'latin1'), ...chunks]);
  const size = Buffer.alloc(4); size.writeUInt32LE(body.length);
  return Buffer.concat([Buffer.from('RIFF', 'latin1'), size, body]);
}

// Little-endian TIFF with a single IFD0 entry: Make = "Canon"
function tiffWithMake() {
  const b = Buffer.alloc(32);
  b.write('II', 0, 'latin1'); b.writeUInt16LE(42, 2); b.writeUInt32LE(8, 4);
  b.writeUInt16LE(1, 8);
  b.writeUInt16LE(0x010f, 10); b.writeUInt16LE(2, 12); b.writeUInt32LE(6, 14); b.writeUInt32LE(26, 18);
  b.writeUInt32LE(0, 22);
  b.write('Canon\0', 26, 'latin1');
  return b;
}

test('isWebp checks the RIFF/WEBP header', () => {
  assert.ok(isWebp(webp()));
  assert.ok(!isWebp(Buffer.from('RIFF\0\0\0\0WAVE', 'latin1')));
});

test('webpChunks finds EXIF (with or without the Exif prefix) and XMP, skipping padded chunks', () => {
  const tiff = tiffWithMake();
  const file = webp(chunk('VP8 ', Buffer.alloc(3)), chunk('EXIF', Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff])), chunk('XMP ', Buffer.from('<x:xmpmeta/>')));
  const out = webpChunks(file);
  assert.ok(out.exif.equals(tiff));
  assert.strictEqual(out.xmp, '<x:xmpmeta/>');
  assert.deepStrictEqual(webpChunks(webp(chunk('VP8L', Buffer.alloc(4)))), { exif: null, xmp: null });
});

test('tiffAsJpeg lets exif-parser read WebP EXIF', () => {
  const tags = exif.create(tiffAsJpeg(tiffWithMake())).parse().tags;
  assert.strictEqual(tags.Make, 'Canon');
});
