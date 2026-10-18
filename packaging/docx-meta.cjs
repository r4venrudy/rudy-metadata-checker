// Reads the author/revision properties Word, Excel and PowerPoint store in docProps/core.xml and docProps/app.xml.
// A DOCX file is a ZIP archive, so this walks the ZIP central directory with node:zlib only.
const zlib = require('node:zlib');
const MAX_XML_BYTES = 1024 * 1024;

function readZipEntry(buffer, wanted) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('Not a valid Office (ZIP) file');
  const count = buffer.readUInt16LE(eocd + 10);
  let ptr = buffer.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(ptr) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(ptr + 10);
    const compressedSize = buffer.readUInt32LE(ptr + 20);
    const uncompressedSize = buffer.readUInt32LE(ptr + 24);
    const nameLen = buffer.readUInt16LE(ptr + 28);
    const extraLen = buffer.readUInt16LE(ptr + 30);
    const commentLen = buffer.readUInt16LE(ptr + 32);
    const localOffset = buffer.readUInt32LE(ptr + 42);
    const name = buffer.toString('utf8', ptr + 46, ptr + 46 + nameLen);
    if (name === wanted) {
      if (uncompressedSize > MAX_XML_BYTES) throw new Error('Office metadata XML exceeds 1 MiB');
      if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) {
        throw new Error('Invalid Office ZIP local header');
      }
      const start = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
      if (start + compressedSize > buffer.length) throw new Error('Truncated Office ZIP entry');
      const data = buffer.subarray(start, start + compressedSize);
      if (method === 0) {
        if (data.length > MAX_XML_BYTES) throw new Error('Office metadata XML exceeds 1 MiB');
        return data.toString('utf8');
      }
      if (method === 8) {
        try {
          const xml = zlib.inflateRawSync(data, { maxOutputLength: MAX_XML_BYTES });
          if (xml.length !== uncompressedSize) throw new Error('Office ZIP entry size does not match its directory');
          return xml.toString('utf8');
        } catch (error) {
          if (error.code === 'ERR_BUFFER_TOO_LARGE') throw new Error('Office metadata XML exceeds 1 MiB');
          throw error;
        }
      }
      throw new Error(`Unsupported ZIP compression method ${method}`);
    }
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

function xmlValue(xml, tag) {
  if (!xml) return null;
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`));
  return m ? decodeXml(m[1]).trim() || null : null;
}

// &amp; must be decoded last, otherwise "&amp;lt;" (a literal "&lt;") would turn into "<"
function decodeXml(text) {
  const decodeCodePoint = (match, digits, radix) => {
    const point = parseInt(digits, radix);
    const valid = point === 0x9 || point === 0xa || point === 0xd ||
      (point >= 0x20 && point <= 0xd7ff) || (point >= 0xe000 && point <= 0xfffd) ||
      (point >= 0x10000 && point <= 0x10ffff);
    return valid ? String.fromCodePoint(point) : match;
  };
  return text
    .replace(/&#x([0-9a-f]+);/gi, (match, h) => decodeCodePoint(match, h, 16))
    .replace(/&#(\d+);/g, (match, d) => decodeCodePoint(match, d, 10))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function docxMetadata(buffer) {
  const core = readZipEntry(buffer, 'docProps/core.xml');
  const app = readZipEntry(buffer, 'docProps/app.xml');
  const metadata = {
    Title: xmlValue(core, 'dc:title') || 'N/A',
    Author: xmlValue(core, 'dc:creator') || 'N/A',
    LastModifiedBy: xmlValue(core, 'cp:lastModifiedBy') || 'N/A',
    Revision: xmlValue(core, 'cp:revision') || 'N/A',
    Created: xmlValue(core, 'dcterms:created') || 'N/A',
    Modified: xmlValue(core, 'dcterms:modified') || 'N/A',
    Application: xmlValue(app, 'Application') || 'N/A',
    Company: xmlValue(app, 'Company') || 'N/A'
  };
  // document size and editing time; each format writes only the counts that apply to it
  for (const [tag, label] of [['Pages', 'Pages'], ['Words', 'Words'], ['Slides', 'Slides'], ['Template', 'Template']]) {
    const value = xmlValue(app, tag);
    if (value && value !== '0') metadata[label] = value;
  }
  const minutes = Number(xmlValue(app, 'TotalTime'));
  if (minutes > 0) metadata.EditingTime = minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
  const sensitive = [];
  if (metadata.Author !== 'N/A' || metadata.LastModifiedBy !== 'N/A') sensitive.push('Author Name');
  if (metadata.Company !== 'N/A') sensitive.push('Company Name');
  return { metadata, sensitive };
}

module.exports = { docxMetadata, readZipEntry, decodeXml };
