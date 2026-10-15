const test = require('node:test');
const assert = require('node:assert');
const { isGif, gifMetadata } = require('./gif-meta.cjs');

function gif(...blocks) {
  const header = Buffer.from('GIF89a', 'latin1');
  const lsd = Buffer.from([2, 0, 3, 0, 0x80, 0, 0]); // 2x3, global color table of 2 entries
  return Buffer.concat([header, lsd, Buffer.alloc(6), ...blocks, Buffer.from([0x3b])]);
}
const comment = text => Buffer.concat([Buffer.from([0x21, 0xfe, text.length]), Buffer.from(text, 'latin1'), Buffer.from([0])]);
const app = id => Buffer.concat([Buffer.from([0x21, 0xff, 11]), Buffer.from(id, 'latin1'), Buffer.from([3, 1, 0, 0, 0])]);
const frame = Buffer.concat([Buffer.from([0x2c, 0, 0, 0, 0, 2, 0, 3, 0, 0, 2, 2, 0x4c, 0x01, 0])]);

test('reads size, frames, comments and writer extensions', () => {
  const file = gif(app('NETSCAPE2.0'), app('XMP DataXMP'), comment('Created with GIMP by Ayse'), frame, frame);
  assert.ok(isGif(file));
  const { metadata, sensitive } = gifMetadata(file);
  assert.equal(metadata.Size, '2 × 3');
  assert.equal(metadata.Frames, '2');
  assert.equal(metadata.Comment, 'Created with GIMP by Ayse');
  assert.equal(metadata.Extensions, 'XMP DataXMP');
  assert.deepEqual(sensitive, ['Embedded Comment']);
});

test('a plain GIF has no findings', () => {
  const { metadata, sensitive } = gifMetadata(gif(frame));
  assert.equal(metadata.Frames, '1');
  assert.deepEqual(sensitive, []);
  assert.ok(!isGif(Buffer.from('GIF80a')));
});
