// JPEG data outside EXIF: COM comment segments and the IPTC block Photoshop and news agencies write
// into APP13. Both often name a person (photographer, author) or a place.

// Yields [marker, start, end] for each segment before the image data (SOS)
function* segments(buffer) {
  let pos = 2;
  while (pos + 4 <= buffer.length && buffer[pos] === 0xff) {
    const marker = buffer[pos + 1];
    if (marker === 0xda || marker === 0xd9) return; // start of scan / end of image
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { pos += 2; continue; } // no length
    const len = buffer.readUInt16BE(pos + 2);
    if (len < 2) return;
    yield [marker, pos + 4, Math.min(buffer.length, pos + 2 + len)];
    pos += 2 + len;
  }
}

function jpegComments(buffer) {
  const out = [];
  for (const [marker, s, e] of segments(buffer)) {
    if (marker === 0xfe) {
      const text = buffer.toString('utf8', s, e).replace(/\0+$/, '').trim();
      if (text) out.push(text);
    }
  }
  return out;
}

// IPTC IIM datasets in record 2 that identify people, places or rights
const IPTC_FIELDS = { 80: 'By-line', 85: 'By-line Title', 90: 'City', 95: 'Province/State', 101: 'Country', 105: 'Headline', 110: 'Credit', 115: 'Source', 116: 'Copyright', 120: 'Caption', 122: 'Writer/Editor', 25: 'Keywords' };

function parseIptc(data) {
  const out = {};
  let pos = 0;
  while (pos + 5 <= data.length && data[pos] === 0x1c) {
    const record = data[pos + 1], dataset = data[pos + 2];
    const len = data.readUInt16BE(pos + 3);
    if (len & 0x8000) break; // extended length datasets are not used for text fields
    const value = data.toString('utf8', pos + 5, pos + 5 + len).trim();
    const name = record === 2 && IPTC_FIELDS[dataset];
    if (name && value) out[name] = out[name] ? `${out[name]}, ${value}` : value;
    pos += 5 + len;
  }
  return out;
}

// APP13 "Photoshop 3.0" holds 8BIM resources; resource 0x0404 is the IPTC block
function jpegIptc(buffer) {
  for (const [marker, s, e] of segments(buffer)) {
    if (marker !== 0xed || buffer.toString('latin1', s, s + 14) !== 'Photoshop 3.0\0') continue;
    let pos = s + 14;
    while (pos + 12 <= e && buffer.toString('latin1', pos, pos + 4) === '8BIM') {
      const id = buffer.readUInt16BE(pos + 4);
      const nameLen = buffer[pos + 6];
      let p = pos + 6 + 1 + nameLen;
      if ((1 + nameLen) % 2) p++; // the Pascal name is padded to an even length
      const size = buffer.readUInt32BE(p);
      const start = p + 4;
      if (id === 0x0404) return parseIptc(buffer.subarray(start, Math.min(e, start + size)));
      pos = start + size + (size % 2);
    }
  }
  return {};
}

module.exports = { jpegComments, jpegIptc, parseIptc };
