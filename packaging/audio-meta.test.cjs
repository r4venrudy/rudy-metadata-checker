const test = require('node:test');
const assert = require('node:assert');
const { isMp3, audioMetadata } = require('./audio-meta.cjs');

function frame(id, body, v4 = false) {
  const size = Buffer.alloc(4);
  if (v4) { let n = body.length; for (let i = 3; i >= 0; i--) { size[i] = n & 0x7f; n >>= 7; } } else size.writeUInt32BE(body.length);
  return Buffer.concat([Buffer.from(id, 'latin1'), size, Buffer.alloc(2), body]);
}
function id3(major, frames) {
  const body = Buffer.concat(frames);
  const size = Buffer.alloc(4); let n = body.length; for (let i = 3; i >= 0; i--) { size[i] = n & 0x7f; n >>= 7; }
  return Buffer.concat([Buffer.from('ID3', 'latin1'), Buffer.from([major, 0, 0]), size, body, Buffer.from([0xff, 0xfb, 0x90, 0])]);
}
const latin1 = t => Buffer.concat([Buffer.from([0]), Buffer.from(t, 'latin1')]);
const utf16 = t => Buffer.concat([Buffer.from([1, 0xff, 0xfe]), Buffer.from(t, 'utf16le')]);

test('reads ID3v2.3 frames in Latin-1 and UTF-16, including comments', () => {
  const file = id3(3, [
    frame('TIT2', latin1('Demo')),
    frame('TPE1', utf16('Şahin')),
    frame('TENC', latin1('Mehmet')),
    frame('TSSE', latin1('LAME 3.100')),
    frame('COMM', Buffer.concat([Buffer.from([0]), Buffer.from('eng', 'latin1'), Buffer.from([0]), Buffer.from('recorded at home', 'latin1')])),
  ]);
  assert.ok(isMp3(file));
  const { metadata, sensitive } = audioMetadata(file);
  assert.deepStrictEqual(metadata, { Title: 'Demo', Artist: 'Şahin', 'Encoded By': 'Mehmet', Encoder: 'LAME 3.100', Comment: 'recorded at home' });
  assert.deepStrictEqual(sensitive, ['Author Name', 'Editing Software']);
});

test('reads ID3v2.4 UTF-8 frames with synchsafe sizes', () => {
  const file = id3(4, [frame('TDRC', Buffer.concat([Buffer.from([3]), Buffer.from('2024-06-01', 'utf8')]), true)]);
  assert.strictEqual(audioMetadata(file).metadata.Recorded, '2024-06-01');
});

test('falls back to ID3v1 and reports untagged files', () => {
  const v1 = Buffer.alloc(128); v1.write('TAG', 0, 'latin1'); v1.write('Old Song', 3, 'latin1'); v1.write('Someone', 33, 'latin1');
  const file = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0]), Buffer.alloc(200), v1]);
  assert.deepStrictEqual(audioMetadata(file).metadata, { Title: 'Old Song', Artist: 'Someone' });
  assert.deepStrictEqual(audioMetadata(Buffer.from([0xff, 0xfb, 0, 0])).metadata, { ID3: 'No ID3 tags found' });
  assert.ok(!isMp3(Buffer.from('hello')));
});
