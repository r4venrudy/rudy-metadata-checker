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

test('rejects truncated screen descriptors and color tables', () => {
  assert.throws(() => gifMetadata(gif().subarray(0, 10)), /Truncated GIF logical screen descriptor/);
  const header = Buffer.concat([
    Buffer.from('GIF89a', 'latin1'),
    Buffer.from([2, 0, 3, 0, 0x80, 0, 0]),
    Buffer.from([0, 0]),
    Buffer.from([0x3b])
  ]);
  assert.throws(() => gifMetadata(header), /Truncated GIF global color table/);
});

test('rejects incomplete extension and image data blocks', () => {
  assert.throws(() => gifMetadata(gif(Buffer.from([0x21, 0xfe, 5, 0x41]))), /Truncated GIF sub-block/);
  assert.throws(() => gifMetadata(gif(Buffer.from([0x2c, 0, 0, 0]))), /Truncated GIF image descriptor/);
  const unterminated = gif(Buffer.from([0x21, 0xfe, 1, 0x41, 0])).subarray(0, -1);
  assert.throws(() => gifMetadata(unterminated), /Truncated GIF trailer/);
});

test('rejects unknown block markers instead of returning partial metadata', () => {
  assert.throws(() => gifMetadata(gif(Buffer.from([0x7f]))), /Invalid GIF block marker/);
});
