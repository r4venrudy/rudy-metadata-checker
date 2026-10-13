// Reads PNG tEXt / iTXt / zTXt chunks, where tools store fields like Author, Software,
// Creation Time or Description (screenshots and exports often carry these).
const zlib = require('node:zlib');
const { decodeXml } = require('./docx-meta.cjs');
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// XMP is an RDF/XML packet; pull out the handful of fields people care about instead of dumping the XML.
function xmpSummary(xml) {
  const grab = re => { const m = xml.match(re); return m ? decodeXml(m[1]).trim().slice(0, 200) : null; };
  const fields = {
    Title: grab(/<dc:title>[\s\S]*?<rdf:li[^>]*>([^<]+)<\/rdf:li>/),
    Author: grab(/<pdf:Author>([^<]+)<\/pdf:Author>/) || grab(/<dc:creator>[\s\S]*?<rdf:li[^>]*>([^<]+)<\/rdf:li>/),
    Software: grab(/<xmp:CreatorTool>([^<]+)<\/xmp:CreatorTool>/),
    Created: grab(/<xmp:CreateDate>([^<]+)<\/xmp:CreateDate>/)
  };
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v));
}

function pngTextChunks(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIG)) throw new Error('Not a PNG file');
  const out = {};
  let pos = 8;
  while (pos + 12 <= buffer.length) {
    const len = buffer.readUInt32BE(pos);
    const type = buffer.toString('latin1', pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + len);
    if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
      const nul = data.indexOf(0);
      if (nul > 0) {
        const key = data.toString('latin1', 0, nul);
        let value = '';
        if (type === 'tEXt') value = data.toString('latin1', nul + 1);
        else if (type === 'zTXt') value = zlib.inflateSync(data.subarray(nul + 2)).toString('latin1');
        else {
          // iTXt: keyword\0 compFlag compMethod lang\0 translated\0 text
          const compressed = data[nul + 1] === 1;
          const langEnd = data.indexOf(0, nul + 3);
          const transEnd = data.indexOf(0, langEnd + 1);
          const text = data.subarray(transEnd + 1);
          value = (compressed ? zlib.inflateSync(text) : text).toString('utf8');
        }
        if (key === 'XML:com.adobe.xmp') Object.assign(out, xmpSummary(value));
        else out[key] = value.trim().slice(0, 200);
      }
    }
    if (type === 'IEND') break;
    pos += 12 + len;
  }
  return out;
}

function pngMetadata(buffer) {
  const text = pngTextChunks(buffer);
  const sensitive = [];
  if (text.Author || text.Copyright) sensitive.push('Author Name');
  if (text.Software) sensitive.push('Editing Software');
  const metadata = Object.keys(text).length ? text : { PNG: 'No text metadata chunks found' };
  return { metadata, sensitive };
}

module.exports = { pngMetadata, pngTextChunks, xmpSummary };
