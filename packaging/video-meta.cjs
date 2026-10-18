// MP4 / MOV (phone videos) are ISO-BMFF like HEIC. The recording date is in moov/mvhd, and phones
// store the location as an ISO 6709 string ("+41.0082+028.9784+035.000/") either in moov/udta/©xyz
// (Android, older iPhones) or in the QuickTime keys/ilst metadata (com.apple.quicktime.location.ISO6709).
const { boxes, HEIF_BRANDS } = require('./heic-meta.cjs');

// seconds between 1904-01-01 (QuickTime epoch) and 1970-01-01
const MAC_EPOCH = 2082844800;

function isVideo(buffer) {
  return buffer.length >= 12 && buffer.toString('latin1', 4, 8) === 'ftyp' && !HEIF_BRANDS.has(buffer.toString('latin1', 8, 12));
}

function child(buffer, start, end, type) {
  for (const [t, s, e] of boxes(buffer, start, end)) if (t === type) return [s, e];
  return null;
}

function macDate(seconds) {
  // 0 means "not set"; many encoders write it
  if (!seconds) return null;
  return new Date((seconds - MAC_EPOCH) * 1000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

function movieHeader(buffer, s) {
  const v1 = buffer[s] === 1;
  const created = v1 ? Number(buffer.readBigUInt64BE(s + 4)) : buffer.readUInt32BE(s + 4);
  const modified = v1 ? Number(buffer.readBigUInt64BE(s + 12)) : buffer.readUInt32BE(s + 8);
  const scale = buffer.readUInt32BE(v1 ? s + 20 : s + 12);
  const duration = v1 ? Number(buffer.readBigUInt64BE(s + 24)) : buffer.readUInt32BE(s + 16);
  return { created: macDate(created), modified: macDate(modified), seconds: scale ? duration / scale : null };
}

// "+41.0082+028.9784+035.000/" -> { lat, lon, alt }
function parseIso6709(text) {
  const m = /^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)?\/?$/.exec(String(text).trim());
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]);
  const alt = m[3] === undefined ? null : Number(m[3]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (alt !== null && !Number.isFinite(alt))) return null;
  return { lat, lon, alt };
}

// QuickTime user data text: 16-bit length, 16-bit language, then the string
function udtaText(buffer, s, e) {
  const len = buffer.readUInt16BE(s);
  return buffer.toString('utf8', s + 4, Math.min(e, s + 4 + len));
}

function userData(buffer, s, e) {
  const out = {};
  const names = { '©xyz': 'location', '©mak': 'make', '©mod': 'model', '©swr': 'software' };
  for (const [t, cs, ce] of boxes(buffer, s, e)) if (names[t] && ce - cs > 4) out[names[t]] = udtaText(buffer, cs, ce);
  return out;
}

// moov/meta: "keys" lists names, "ilst" holds values whose box type is the 1-based key index
function quickTimeKeys(buffer, s, e) {
  // QuickTime's meta is a plain box, MP4's is a full box with 4 bytes of version/flags first
  const keysBox = child(buffer, s, e, 'keys') || child(buffer, s + 4, e, 'keys');
  const ilst = child(buffer, s, e, 'ilst') || child(buffer, s + 4, e, 'ilst');
  if (!keysBox || !ilst) return {};
  const keys = [];
  let pos = keysBox[0] + 8;
  const count = buffer.readUInt32BE(keysBox[0] + 4);
  for (let i = 0; i < count && pos + 8 <= keysBox[1]; i++) {
    const size = buffer.readUInt32BE(pos);
    if (size < 8) break;
    keys.push(buffer.toString('utf8', pos + 8, pos + size));
    pos += size;
  }
  const out = {};
  for (const [, is, ie] of boxes(buffer, ilst[0], ilst[1])) {
    const index = buffer.readUInt32BE(is - 4);
    const data = child(buffer, is, ie, 'data');
    if (!data || !keys[index - 1]) continue;
    // type 1 is UTF-8 text; other types (numbers, images) are skipped
    if (buffer.readUInt32BE(data[0]) === 1) out[keys[index - 1]] = buffer.toString('utf8', data[0] + 8, data[1]);
  }
  return out;
}

function videoMetadata(buffer) {
  const moov = child(buffer, 0, buffer.length, 'moov');
  if (!moov) return { metadata: { Video: 'No moov box found (the file may be cut off or still recording)' }, sensitive: [] };
  const mvhd = child(buffer, moov[0], moov[1], 'mvhd');
  const udta = child(buffer, moov[0], moov[1], 'udta');
  const meta = child(buffer, moov[0], moov[1], 'meta');
  const header = mvhd ? movieHeader(buffer, mvhd[0]) : {};
  const ud = udta ? userData(buffer, udta[0], udta[1]) : {};
  const qt = meta ? quickTimeKeys(buffer, meta[0], meta[1]) : {};

  const make = qt['com.apple.quicktime.make'] || ud.make;
  const model = qt['com.apple.quicktime.model'] || ud.model;
  const software = qt['com.apple.quicktime.software'] || ud.software;
  const created = qt['com.apple.quicktime.creationdate'] || header.created;
  const gps = parseIso6709(qt['com.apple.quicktime.location.ISO6709'] || ud.location || '');

  const metadata = {
    Camera: [make, model].filter(Boolean).join(' ') || 'N/A',
    Software: software || 'N/A',
    Created: created || 'N/A',
    Duration: header.seconds ? `${header.seconds.toFixed(1)} s` : 'N/A',
    GPS: gps ? `${gps.lat.toFixed(6)}, ${gps.lon.toFixed(6)} (https://maps.google.com/?q=${gps.lat},${gps.lon})` : 'Not found',
  };
  if (header.modified && header.modified !== header.created) metadata.Modified = header.modified;
  if (gps && gps.alt !== null) metadata.Altitude = `${gps.alt.toFixed(0)} m`;

  const sensitive = [];
  if (gps) sensitive.push('GPS Location');
  if (software) sensitive.push('Editing Software');
  return { metadata, sensitive };
}

module.exports = { isVideo, videoMetadata, parseIso6709 };
