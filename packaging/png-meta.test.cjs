const test = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');
const { pngMetadata, xmpSummary } = require('./png-meta.cjs');

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]); // CRC is not checked
}

function png(...chunks) {
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunks, chunk('IEND', Buffer.alloc(0))]);
}

test('reads tEXt, zTXt and iTXt chunks', () => {
  const buf = png(
    chunk('tEXt', Buffer.from('Software\0GIMP 2.10', 'latin1')),
    chunk('zTXt', Buffer.concat([Buffer.from('Author\0\0', 'latin1'), zlib.deflateSync('Jane Doe')])),
    chunk('iTXt', Buffer.from('Description\0\0\0tr\0\0Ekran görüntüsü', 'utf8'))
  );
  const { metadata, sensitive } = pngMetadata(buf);
  assert.deepStrictEqual(metadata, { Software: 'GIMP 2.10', Author: 'Jane Doe', Description: 'Ekran görüntüsü' });
  assert.deepStrictEqual(sensitive, ['Author Name', 'Editing Software']);
});

test('PNG without text chunks', () => {
  assert.deepStrictEqual(pngMetadata(png()).metadata, { PNG: 'No text metadata chunks found' });
});

test('rejects non-PNG data', () => {
  assert.throws(() => pngMetadata(Buffer.from('nope')), /Not a PNG/);
});

test('summarizes XMP packets instead of dumping XML', () => {
  const xmp = `<x:xmpmeta><rdf:RDF><rdf:Description><dc:title><rdf:Alt><rdf:li xml:lang='x-default'>Poster v2</rdf:li></rdf:Alt></dc:title></rdf:Description>
    <rdf:Description><pdf:Author>Test Author</pdf:Author></rdf:Description>
    <rdf:Description><xmp:CreatorTool>Canva</xmp:CreatorTool></rdf:Description></rdf:RDF></x:xmpmeta>`;
  assert.deepStrictEqual(xmpSummary(xmp), { Title: 'Poster v2', Author: 'Test Author', Software: 'Canva' });
  const buf = png(chunk('iTXt', Buffer.from(`XML:com.adobe.xmp\0\0\0\0\0${xmp}`, 'utf8')));
  assert.deepStrictEqual(pngMetadata(buf).sensitive, ['Author Name', 'Editing Software']);
});
