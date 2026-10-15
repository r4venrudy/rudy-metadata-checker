// HEIC/HEIF (iPhone photos) is an ISO-BMFF container. EXIF is stored as an item of type "Exif":
// the "iinf" box names the item, the "iloc" box says where its bytes are in the file.
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1', 'avif']);

function isHeif(buffer) {
  return buffer.length >= 12 && buffer.toString('latin1', 4, 8) === 'ftyp' && HEIF_BRANDS.has(buffer.toString('latin1', 8, 12));
}

function readUInt(buffer, pos, size) {
  if (size === 0) return 0;
  if (size === 2) return buffer.readUInt16BE(pos);
  if (size === 4) return buffer.readUInt32BE(pos);
  if (size === 8) return Number(buffer.readBigUInt64BE(pos));
  throw new Error(`Unsupported field size ${size}`);
}

// Yields [type, start of content, end] for each box between start and end
function* boxes(buffer, start, end) {
  let pos = start;
  while (pos + 8 <= end) {
    let size = buffer.readUInt32BE(pos);
    const type = buffer.toString('latin1', pos + 4, pos + 8);
    let header = 8;
    if (size === 1) { size = Number(buffer.readBigUInt64BE(pos + 8)); header = 16; }
    if (size === 0) size = end - pos;
    if (size < header || pos + size > end) return;
    yield [type, pos + header, pos + size];
    pos += size;
  }
}

function exifItemId(buffer, start, end) {
  const version = buffer[start];
  let pos = start + 4 + (version === 0 ? 2 : 4);
  for (const [type, s, e] of boxes(buffer, pos, end)) {
    if (type !== 'infe') continue;
    const v = buffer[s];
    if (v < 2) continue;
    const id = v === 2 ? buffer.readUInt16BE(s + 4) : buffer.readUInt32BE(s + 4);
    const typeAt = s + 4 + (v === 2 ? 2 : 4) + 2;
    if (buffer.toString('latin1', typeAt, typeAt + 4) === 'Exif') return id;
  }
  return null;
}

function itemLocation(buffer, start, wanted) {
  const version = buffer[start];
  let pos = start + 4;
  const offsetSize = buffer[pos] >> 4, lengthSize = buffer[pos] & 15;
  const baseSize = buffer[pos + 1] >> 4, indexSize = version > 0 ? buffer[pos + 1] & 15 : 0;
  pos += 2;
  const count = version < 2 ? buffer.readUInt16BE(pos) : buffer.readUInt32BE(pos);
  pos += version < 2 ? 2 : 4;
  for (let i = 0; i < count; i++) {
    const id = version < 2 ? buffer.readUInt16BE(pos) : buffer.readUInt32BE(pos);
    pos += version < 2 ? 2 : 4;
    if (version > 0) pos += 2; // construction_method
    pos += 2; // data_reference_index
    const base = readUInt(buffer, pos, baseSize); pos += baseSize;
    const extents = buffer.readUInt16BE(pos); pos += 2;
    let first = null;
    for (let x = 0; x < extents; x++) {
      pos += indexSize;
      const offset = readUInt(buffer, pos, offsetSize); pos += offsetSize;
      const length = readUInt(buffer, pos, lengthSize); pos += lengthSize;
      if (!first) first = { offset: base + offset, length };
    }
    if (id === wanted) return first;
  }
  return null;
}

// Returns the TIFF block of the EXIF item, or null when the file has none
function heifExif(buffer) {
  if (!isHeif(buffer)) throw new Error('Not a HEIF/HEIC file');
  for (const [type, s, e] of boxes(buffer, 0, buffer.length)) {
    if (type !== 'meta') continue;
    const children = [...boxes(buffer, s + 4, e)];
    const iinf = children.find(b => b[0] === 'iinf');
    const iloc = children.find(b => b[0] === 'iloc');
    if (!iinf || !iloc) return null;
    const id = exifItemId(buffer, iinf[1], iinf[2]);
    if (id === null) return null;
    const loc = itemLocation(buffer, iloc[1], id);
    if (!loc || loc.offset + loc.length > buffer.length) return null;
    const item = buffer.subarray(loc.offset, loc.offset + loc.length);
    // the item starts with a 4-byte offset to the TIFF header (skipping an optional "Exif\0\0")
    const tiffStart = 4 + item.readUInt32BE(0);
    return tiffStart < item.length ? item.subarray(tiffStart) : null;
  }
  return null;
}

module.exports = { isHeif, heifExif, boxes, HEIF_BRANDS };
