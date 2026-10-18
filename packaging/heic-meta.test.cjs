const test = require('node:test');
const assert = require('node:assert');
const exif = require('exif-parser');
const { isHeif, heifExif } = require('./heic-meta.cjs');
const { tiffAsJpeg } = require('./webp-meta.cjs');

function box(type, ...parts) {
  const body = Buffer.concat(parts);
  const size = Buffer.alloc(4); size.writeUInt32BE(body.length + 8);
  return Buffer.concat([size, Buffer.from(type, 'latin1'), body]);
}
const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const full = (version) => Buffer.from([version, 0, 0, 0]);

// Little-endian TIFF with one IFD0 entry: Make = "Apple"
function tiffWithMake() {
  const b = Buffer.alloc(32);
  b.write('II', 0, 'latin1'); b.writeUInt16LE(42, 2); b.writeUInt32LE(8, 4);
  b.writeUInt16LE(1, 8);
  b.writeUInt16LE(0x010f, 10); b.writeUInt16LE(2, 12); b.writeUInt32LE(6, 14); b.writeUInt32LE(26, 18);
  b.writeUInt32LE(0, 22);
  b.write('Apple\0', 26, 'latin1');
  return b;
}

function heic(withExif = true) {
  const item = Buffer.concat([u32(6), Buffer.from('Exif\0\0', 'latin1'), tiffWithMake()]);
  const ftyp = box('ftyp', Buffer.from('heic', 'latin1'), u32(0), Buffer.from('mif1heic', 'latin1'));
  const infe = box('infe', full(2), u16(1), u16(0), Buffer.from(withExif ? 'Exif' : 'hvc1', 'latin1'), Buffer.from([0]));
  const iinf = box('iinf', full(0), u16(1), infe);
  const build = offset => box('meta', full(0), iinf,
    box('iloc', full(0), Buffer.from([0x44, 0x00]), u16(1), u16(1), u16(0), u16(1), u32(offset), u32(item.length)));
  const offset = ftyp.length + build(0).length + 8; // item bytes start right after the mdat header
  return Buffer.concat([ftyp, build(offset), box('mdat', item)]);
}

function heicWithIdat() {
  const item = Buffer.concat([u32(6), Buffer.from('Exif\0\0', 'latin1'), tiffWithMake()]);
  const ftyp = box('ftyp', Buffer.from('heic', 'latin1'), u32(0), Buffer.from('mif1heic', 'latin1'));
  const infe = box('infe', full(2), u16(1), u16(0), Buffer.from('Exif', 'latin1'), Buffer.from([0]));
  const iinf = box('iinf', full(0), u16(1), infe);
  const split = 9;
  const iloc = box('iloc', full(1), Buffer.from([0x44, 0]), u16(1), u16(1), u16(1), u16(0), u16(2),
    u32(0), u32(split), u32(split), u32(item.length - split));
  return Buffer.concat([ftyp, box('meta', full(0), iinf, iloc, box('idat', item))]);
}

test('isHeif checks the ftyp brand', () => {
  assert.ok(isHeif(heic()));
  assert.ok(!isHeif(Buffer.from('\0\0\0\x18ftypisom', 'latin1')));
});

test('heifExif finds the Exif item through iinf and iloc', () => {
  const tiff = heifExif(heic());
  assert.ok(tiff.equals(tiffWithMake()));
  assert.strictEqual(exif.create(tiffAsJpeg(tiff)).parse().tags.Make, 'Apple');
});

test('heifExif returns null when there is no Exif item', () => {
  assert.strictEqual(heifExif(heic(false)), null);
});

test('heifExif resolves split extents relative to the idat payload', () => {
  const tiff = heifExif(heicWithIdat());
  assert.ok(tiff.equals(tiffWithMake()));
  assert.strictEqual(exif.create(tiffAsJpeg(tiff)).parse().tags.Make, 'Apple');
});
