// GIFs carry no EXIF, but editors leave comment extensions ("Created with GIMP", names, URLs)
// and the application extensions say which tool wrote the file (XMP Data, NETSCAPE2.0 for loops).
function isGif(buffer) {
  return buffer.length >= 6 && /^GIF8[79]a$/.test(buffer.toString('latin1', 0, 6));
}

// Data sub-blocks: length byte, then that many bytes, until a 0 length
function subBlocks(buffer, pos) {
  const parts = [];
  while (pos < buffer.length && buffer[pos] !== 0) {
    parts.push(buffer.subarray(pos + 1, pos + 1 + buffer[pos]));
    pos += 1 + buffer[pos];
  }
  return { data: Buffer.concat(parts), next: pos + 1 };
}

function gifMetadata(buffer) {
  const width = buffer.readUInt16LE(6), height = buffer.readUInt16LE(8);
  let pos = 13;
  if (buffer[10] & 0x80) pos += 3 * 2 ** ((buffer[10] & 7) + 1); // global color table
  const comments = [];
  const apps = new Set();
  let frames = 0;
  while (pos < buffer.length) {
    const block = buffer[pos];
    if (block === 0x3b) break; // trailer
    if (block === 0x21) {
      const label = buffer[pos + 1];
      if (label === 0xff && buffer[pos + 2] === 11) apps.add(buffer.toString('latin1', pos + 3, pos + 14).trim());
      const start = label === 0xff || label === 0xf9 || label === 0x01 ? pos + 3 + buffer[pos + 2] : pos + 2;
      const { data, next } = subBlocks(buffer, start);
      if (label === 0xfe) comments.push(data.toString('latin1').trim());
      pos = next;
    } else if (block === 0x2c) {
      frames++;
      let p = pos + 10;
      if (buffer[pos + 9] & 0x80) p += 3 * 2 ** ((buffer[pos + 9] & 7) + 1); // local color table
      pos = subBlocks(buffer, p + 1).next; // skip LZW minimum code size, then image data
    } else {
      break; // unknown block: stop rather than misread the rest
    }
  }
  const metadata = { Size: `${width} × ${height}`, Frames: String(frames) };
  if (comments.length) metadata.Comment = comments.filter(Boolean).join(' | ').slice(0, 300);
  const tools = [...apps].filter(a => a !== 'NETSCAPE2.0' && a !== 'ANIMEXTS1.0');
  if (tools.length) metadata.Extensions = tools.join(', ');
  return { metadata, sensitive: comments.length ? ['Embedded Comment'] : [] };
}

module.exports = { isGif, gifMetadata };
