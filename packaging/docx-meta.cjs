// Reads the author/revision properties Word stores in docProps/core.xml and docProps/app.xml.
// A DOCX file is a ZIP archive, so this walks the ZIP central directory with node:zlib only.
const zlib = require('node:zlib');

function readZipEntry(buffer, wanted) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('Not a valid DOCX (ZIP) file');
  const count = buffer.readUInt16LE(eocd + 10);
  let ptr = buffer.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(ptr) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(ptr + 10);
    const compressedSize = buffer.readUInt32LE(ptr + 20);
    const nameLen = buffer.readUInt16LE(ptr + 28);
    const extraLen = buffer.readUInt16LE(ptr + 30);
    const commentLen = buffer.readUInt16LE(ptr + 32);
    const localOffset = buffer.readUInt32LE(ptr + 42);
    const name = buffer.toString('utf8', ptr + 46, ptr + 46 + nameLen);
    if (name === wanted) {
      const start = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
      const data = buffer.subarray(start, start + compressedSize);
      if (method === 0) return data.toString('utf8');
      if (method === 8) return zlib.inflateRawSync(data).toString('utf8');
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
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
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
  const sensitive = [];
  if (metadata.Author !== 'N/A' || metadata.LastModifiedBy !== 'N/A') sensitive.push('Author Name');
  if (metadata.Company !== 'N/A') sensitive.push('Company Name');
  return { metadata, sensitive };
}

module.exports = { docxMetadata, readZipEntry, decodeXml };
