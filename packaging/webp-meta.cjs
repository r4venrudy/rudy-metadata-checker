// WebP is a RIFF container: "RIFF" <size> "WEBP" followed by chunks. Camera and editor metadata
// sits in an "EXIF" chunk (a TIFF block, sometimes prefixed with "Exif\0\0") and an "XMP " chunk.
function isWebp(buffer) {
  if (buffer.length < 12 || buffer.toString('latin1', 0, 4) !== 'RIFF' || buffer.toString('latin1', 8, 12) !== 'WEBP') return false;
  const riffSize = buffer.readUInt32LE(4);
  return riffSize >= 4 && riffSize <= buffer.length - 8;
}

function webpChunks(buffer) {
  if (!isWebp(buffer)) throw new Error('Not a WebP file');
  const out = { exif: null, xmp: null };
  const end = 8 + buffer.readUInt32LE(4);
  let pos = 12;
  while (pos < end) {
    if (pos + 8 > end) throw new Error('Truncated WebP chunk header');
    const type = buffer.toString('latin1', pos, pos + 4);
    const len = buffer.readUInt32LE(pos + 4);
    const paddedLength = len + (len % 2);
    if (paddedLength > end - pos - 8) throw new Error('Truncated WebP chunk');
    const data = buffer.subarray(pos + 8, pos + 8 + len);
    if (type === 'EXIF') {
      out.exif = data.subarray(0, 6).toString('latin1') === 'Exif\0\0' ? data.subarray(6) : data;
    } else if (type === 'XMP ') {
      out.xmp = data.toString('utf8');
    }
    pos += 8 + paddedLength; // chunks are padded to an even length
  }
  return out;
}

// exif-parser only reads JPEG, so wrap the TIFF block in a minimal JPEG APP1 segment it understands.
function tiffAsJpeg(tiff) {
  const header = Buffer.from('Exif\0\0', 'latin1');
  const len = Buffer.alloc(2);
  len.writeUInt16BE(2 + header.length + tiff.length);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), len, header, tiff, Buffer.from([0xff, 0xd9])]);
}

module.exports = { isWebp, webpChunks, tiffAsJpeg };
