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

const synchsafe = (b, p) => (b[p] << 21) | (b[p + 1] << 14) | (b[p + 2] << 7) | b[p + 3];

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
  const end = Math.min(buffer.length, 10 + synchsafe(buffer, 6));
  let pos = 10;
  if (buffer[5] & 0x40) pos += major === 4 ? synchsafe(buffer, 10) : buffer.readUInt32BE(10) + 4; // extended header
  while (pos + 10 <= end) {
    const id = buffer.toString('latin1', pos, pos + 4);
    if (!/^[A-Z0-9]{4}$/.test(id)) break; // padding
    const size = major === 4 ? synchsafe(buffer, pos + 4) : buffer.readUInt32BE(pos + 4);
    const data = buffer.subarray(pos + 10, pos + 10 + size);
    if (FRAMES[id] && data.length) {
      // COMM: encoding, 3-byte language, short description\0, text
      const text = id === 'COMM' ? decodeText(Buffer.concat([data.subarray(0, 1), data.subarray(4)])) : decodeText(data);
      if (text.trim()) out[FRAMES[id]] = text.trim().slice(0, 200);
    }
    pos += 10 + size;
  }
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
