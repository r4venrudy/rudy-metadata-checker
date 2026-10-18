// MP3 files carry ID3v2 tags at the start (and sometimes an old ID3v1 block at the end). Besides
// title and artist, "encoded by", encoder settings and comments often name a person or a tool.
const FRAMES = {
  TIT2: 'Title', TPE1: 'Artist', TALB: 'Album', TYER: 'Year', TDRC: 'Recorded',
  TENC: 'Encoded By', TSSE: 'Encoder', TCOP: 'Copyright', TOWN: 'Owner', COMM: 'Comment',
};

function isMp3(buffer) {
  if (buffer.length >= 10 && buffer.toString('latin1', 0, 3) === 'ID3') return true;
  // no tag: an MPEG audio frame sync (11 set bits) at the start
  return buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
}

function synchsafe(b, p) {
  if (p + 4 > b.length || [b[p], b[p + 1], b[p + 2], b[p + 3]].some(v => v & 0x80))
    throw new Error('Invalid ID3v2 synchsafe size');
  return b[p] * 0x200000 + b[p + 1] * 0x4000 + b[p + 2] * 0x80 + b[p + 3];
}

function decodeText(data) {
  const enc = data[0], body = data.subarray(1);
  let text;
  if (enc === 1 || enc === 2) {
    // UTF-16 with BOM (1) or big-endian without (2); Node only decodes little-endian
    let b = body, le = enc === 1;
    if (enc === 1 && b[0] === 0xfe && b[1] === 0xff) { le = false; b = b.subarray(2); }
    else if (enc === 1 && b[0] === 0xff && b[1] === 0xfe) b = b.subarray(2);
    if (!le) { b = Buffer.from(b.subarray(0, b.length - (b.length % 2))); b.swap16(); }
    text = b.toString('utf16le');
  } else {
    text = body.toString(enc === 3 ? 'utf8' : 'latin1');
  }
  return text.replace(/\0+$/, '').split('\0').filter(Boolean).pop() || '';
}

function id3v2(buffer) {
  const out = {};
  const major = buffer[3];
  if (major !== 3 && major !== 4) return out; // this reader supports ID3v2.3 and v2.4 frames
  const end = 10 + synchsafe(buffer, 6);
  const hasFooter = major === 4 && (buffer[5] & 0x10) !== 0;
  if (end + (hasFooter ? 10 : 0) > buffer.length) throw new Error('Truncated ID3v2 tag');
  if (hasFooter && (buffer.toString('latin1', end, end + 3) !== '3DI' || !buffer.subarray(3, 10).equals(buffer.subarray(end + 3, end + 10))))
    throw new Error('Invalid ID3v2 footer');
  let pos = 10;
  if (buffer[5] & 0x40) {
    if (pos + 4 > end) throw new Error('Truncated ID3v2 extended header');
    const size = major === 4 ? synchsafe(buffer, pos) : buffer.readUInt32BE(pos) + 4;
    if (size < (major === 4 ? 6 : 10) || pos + size > end) throw new Error('Truncated ID3v2 extended header');
    pos += size;
  }
  while (pos + 10 <= end) {
    const id = buffer.toString('latin1', pos, pos + 4);
    if (!/^[A-Z0-9]{4}$/.test(id)) {
      if (buffer.subarray(pos, end).every(byte => byte === 0)) break; // padding
      throw new Error('Invalid ID3v2 frame header');
    }
    const size = major === 4 ? synchsafe(buffer, pos + 4) : buffer.readUInt32BE(pos + 4);
    if (size > end - pos - 10) throw new Error('Truncated ID3v2 frame');
    const data = buffer.subarray(pos + 10, pos + 10 + size);
    if (FRAMES[id] && data.length) {
      // COMM: encoding, 3-byte language, short description\0, text
      const text = id === 'COMM' ? decodeText(Buffer.concat([data.subarray(0, 1), data.subarray(4)])) : decodeText(data);
      if (text.trim()) out[FRAMES[id]] = text.trim().slice(0, 200);
    }
    pos += 10 + size;
  }
  if (pos < end && !buffer.subarray(pos, end).every(byte => byte === 0))
    throw new Error('Truncated ID3v2 frame header');
  return out;
}

function id3v1(buffer) {
  const tag = buffer.subarray(buffer.length - 128);
  if (buffer.length < 128 || tag.toString('latin1', 0, 3) !== 'TAG') return {};
  const field = (s, e) => tag.toString('latin1', s, e).replace(/\0.*$/, '').trim();
  const out = { Title: field(3, 33), Artist: field(33, 63), Album: field(63, 93), Year: field(93, 97), Comment: field(97, 125) };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v));
}

function audioMetadata(buffer) {
  const tags = { ...id3v1(buffer), ...(buffer.toString('latin1', 0, 3) === 'ID3' ? id3v2(buffer) : {}) };
  const metadata = Object.keys(tags).length ? tags : { ID3: 'No ID3 tags found' };
  const sensitive = [];
  if (tags['Encoded By'] || tags.Owner) sensitive.push('Author Name');
  if (tags.Encoder) sensitive.push('Editing Software');
  return { metadata, sensitive };
}

module.exports = { isMp3, audioMetadata };
