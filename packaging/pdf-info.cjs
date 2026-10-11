const { PDFParse } = require('pdf-parse');
async function pdfInfo(buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getInfo();
    return result.info || result.infoData || {};
  } finally { await parser.destroy(); }
}
module.exports = { pdfInfo };
