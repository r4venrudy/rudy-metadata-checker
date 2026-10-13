// WebP is a RIFF container: "RIFF" <size> "WEBP" followed by chunks. Camera and editor metadata
// sits in an "EXIF" chunk (a TIFF block, sometimes prefixed with "Exif\0\0") and an "XMP " chunk.
function isWebp(buffer) {
  return buffer.length >= 12 && buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP';
}

function webpChunks(buffer) {
  if (!isWebp(buffer)) throw new Error('Not a WebP file');
  const out = { exif: null, xmp: null };
  let pos = 12;
  while (pos + 8 <= buffer.length) {
    const type = buffer.toString('latin1', pos, pos + 4);
    const len = buffer.readUInt32LE(pos + 4);
    const data = buffer.subarray(pos + 8, pos + 8 + len);
    if (type === 'EXIF') {
      out.exif = data.subarray(0, 6).toString('latin1') === 'Exif\0\0' ? data.subarray(6) : data;
    } else if (type === 'XMP ') {
      out.xmp = data.toString('utf8');
    }
    pos += 8 + len + (len % 2); // chunks are padded to an even length
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
