const test = require('node:test');
const assert = require('node:assert');
const { isVideo, videoMetadata, parseIso6709 } = require('./video-meta.cjs');

function box(type, ...parts) {
  const body = Buffer.concat(parts);
  const size = Buffer.alloc(4); size.writeUInt32BE(body.length + 8);
  return Buffer.concat([size, Buffer.from(type, 'latin1'), body]);
}
const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const text = s => Buffer.concat([u16(Buffer.byteLength(s)), u16(0), Buffer.from(s)]);

// 2024-05-01 12:00:00 UTC in QuickTime seconds
const created = Date.UTC(2024, 4, 1, 12) / 1000 + 2082844800;
const mvhd = box('mvhd', Buffer.from([0, 0, 0, 0]), u32(created), u32(created), u32(600), u32(600 * 12), Buffer.alloc(80));
const ftyp = box('ftyp', Buffer.from('isom'), u32(0));

test('reads date, duration, device and ©xyz location from udta', () => {
  const udta = box('udta', box('©xyz', text('+41.0082+028.9784+035.000/')), box('©mak', text('samsung')), box('©mod', text('SM-S918B')));
  const file = Buffer.concat([ftyp, box('moov', mvhd, udta)]);
  assert.ok(isVideo(file));
  const { metadata, sensitive } = videoMetadata(file);
  assert.equal(metadata.Created, '2024-05-01 12:00:00 UTC');
  assert.equal(metadata.Duration, '12.0 s');
  assert.equal(metadata.Camera, 'samsung SM-S918B');
  assert.match(metadata.GPS, /^41\.008200, 28\.978400/);
  assert.equal(metadata.Altitude, '35 m');
  assert.deepEqual(sensitive, ['GPS Location']);
});

test('reads iPhone QuickTime keys metadata', () => {
  const key = name => Buffer.concat([u32(8 + name.length), Buffer.from('mdta'), Buffer.from(name)]);
  const names = ['com.apple.quicktime.location.ISO6709', 'com.apple.quicktime.model', 'com.apple.quicktime.software'];
  const keys = box('keys', u32(0), u32(names.length), ...names.map(key));
  const item = (i, value) => {
    const b = box('data', u32(1), u32(0), Buffer.from(value));
    const size = u32(b.length + 8);
    return Buffer.concat([size, u32(i), b]);
  };
  const ilst = box('ilst', item(1, '-33.8568+151.2153+005.000/'), item(2, 'iPhone 15 Pro'), item(3, '17.4'));
  const file = Buffer.concat([box('ftyp', Buffer.from('qt  '), u32(0)), box('moov', mvhd, box('meta', box('hdlr', Buffer.alloc(24)), keys, ilst))]);
  const { metadata, sensitive } = videoMetadata(file);
  assert.equal(metadata.Camera, 'iPhone 15 Pro');
  assert.equal(metadata.Software, '17.4');
  assert.match(metadata.GPS, /^-33\.856800, 151\.215300/);
  assert.deepEqual(sensitive, ['GPS Location', 'Editing Software']);
});

test('handles files without moov and bad ISO 6709 strings', () => {
  assert.match(videoMetadata(ftyp).metadata.Video, /No moov/);
  assert.equal(parseIso6709('hello'), null);
  assert.equal(parseIso6709('+95.0+010.0/'), null);
  assert.ok(!isVideo(Buffer.concat([box('ftyp', Buffer.from('heic'), u32(0))])));
});
