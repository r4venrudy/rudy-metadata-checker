// GIFs carry no EXIF, but editors leave comment extensions ("Created with GIMP", names, URLs)
// and the application extensions say which tool wrote the file (XMP Data, NETSCAPE2.0 for loops).
function isGif(buffer) {
  return buffer.length >= 6 && /^GIF8[79]a$/.test(buffer.toString('latin1', 0, 6));
}

// Data sub-blocks: length byte, then that many bytes, until a 0 length
function subBlocks(buffer, pos) {
  const parts = [];
  while (true) {
    if (pos >= buffer.length) throw new Error('Truncated GIF sub-block terminator');
    const size = buffer[pos];
    if (size === 0) return { data: Buffer.concat(parts), next: pos + 1 };
    if (size > buffer.length - pos - 1) throw new Error('Truncated GIF sub-block');
    parts.push(buffer.subarray(pos + 1, pos + 1 + size));
    pos += 1 + size;
  }
}

function gifMetadata(buffer) {
  if (!isGif(buffer)) throw new Error('Not a GIF file');
  if (buffer.length < 13) throw new Error('Truncated GIF logical screen descriptor');
  const width = buffer.readUInt16LE(6), height = buffer.readUInt16LE(8);
  let pos = 13;
  if (buffer[10] & 0x80) {
    const colorTableBytes = 3 * 2 ** ((buffer[10] & 7) + 1);
    if (colorTableBytes > buffer.length - pos) throw new Error('Truncated GIF global color table');
    pos += colorTableBytes;
  }
  const comments = [];
  const apps = new Set();
  let frames = 0;
  let hasTrailer = false;
  while (pos < buffer.length) {
    const block = buffer[pos];
    if (block === 0x3b) { hasTrailer = true; break; } // trailer
    if (block === 0x21) {
      if (pos + 2 >= buffer.length) throw new Error('Truncated GIF extension header');
      const label = buffer[pos + 1];
      if (label === 0xff && buffer[pos + 2] === 11) apps.add(buffer.toString('latin1', pos + 3, pos + 14).trim());
      const start = label === 0xff || label === 0xf9 || label === 0x01 ? pos + 3 + buffer[pos + 2] : pos + 2;
      const { data, next } = subBlocks(buffer, start);
      if (label === 0xfe) comments.push(data.toString('latin1').trim());
      pos = next;
    } else if (block === 0x2c) {
      if (pos + 10 > buffer.length) throw new Error('Truncated GIF image descriptor');
      frames++;
      let p = pos + 10;
      if (buffer[pos + 9] & 0x80) {
        const colorTableBytes = 3 * 2 ** ((buffer[pos + 9] & 7) + 1);
        if (colorTableBytes > buffer.length - p) throw new Error('Truncated GIF local color table');
        p += colorTableBytes;
      }
      if (p >= buffer.length) throw new Error('Truncated GIF image data');
      pos = subBlocks(buffer, p + 1).next; // skip LZW minimum code size, then image data
    } else {
      throw new Error('Invalid GIF block marker');
    }
  }
  if (!hasTrailer) throw new Error('Truncated GIF trailer');
  const metadata = { Size: `${width} × ${height}`, Frames: String(frames) };
  if (comments.length) metadata.Comment = comments.filter(Boolean).join(' | ').slice(0, 300);
  const tools = [...apps].filter(a => a !== 'NETSCAPE2.0' && a !== 'ANIMEXTS1.0');
  if (tools.length) metadata.Extensions = tools.join(', ');
  return { metadata, sensitive: comments.length ? ['Embedded Comment'] : [] };
}

module.exports = { isGif, gifMetadata };
