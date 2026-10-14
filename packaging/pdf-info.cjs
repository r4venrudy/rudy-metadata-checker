const { PDFParse } = require('pdf-parse');
async function pdfInfo(buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getInfo();
    // page count lives next to the Info dictionary in getInfo()'s result
    return { ...(result.info || result.infoData || {}), Pages: result.total };
  } finally { await parser.destroy(); }
}
module.exports = { pdfInfo };
