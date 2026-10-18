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

test('caps expanded compressed text metadata', () => {
  const compressed = zlib.deflateSync(Buffer.alloc(128 * 1024, 65));
  const file = png(chunk('zTXt', Buffer.concat([Buffer.from('Comment\0\0'), compressed])));
  assert.throws(() => pngMetadata(file), /exceeds 64 KiB/);
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

test('xmpSummary decodes XML entities', () => {
  assert.deepStrictEqual(xmpSummary('<xmp:CreatorTool>Canva &amp; Co</xmp:CreatorTool>'), { Software: 'Canva & Co' });
});

test('pngExifChunk finds the eXIf chunk, also after IDAT', () => {
  const { pngExifChunk } = require('./png-meta.cjs');
  const exif = require('exif-parser');
  const { tiffAsJpeg } = require('./webp-meta.cjs');
  const tiff = Buffer.alloc(32);
  tiff.write('II', 0, 'latin1'); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x010f, 10); tiff.writeUInt16LE(2, 12); tiff.writeUInt32LE(6, 14); tiff.writeUInt32LE(26, 18);
  tiff.write('Apple\0', 26, 'latin1');
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const file = Buffer.concat([sig, chunk('IHDR', Buffer.alloc(13)), chunk('IDAT', Buffer.alloc(4)), chunk('eXIf', tiff), chunk('IEND', Buffer.alloc(0))]);
  const found = pngExifChunk(file);
  assert.ok(found.equals(tiff));
  assert.equal(exif.create(tiffAsJpeg(found)).parse().tags.Make, 'Apple');
  assert.equal(pngExifChunk(Buffer.concat([sig, chunk('IEND', Buffer.alloc(0))])), null);
});

test('xmpSummary reads GPS in attribute and element form', () => {
  const attr = xmpSummary('<rdf:Description exif:GPSLatitude="41,0.492N" exif:GPSLongitude="28,58.71E"/>');
  assert.match(attr.GPS, /^41\.008200, 28\.978500 \(https:\/\/maps\.google\.com/);
  const elem = xmpSummary('<exif:GPSLatitude>33,51,24.48S</exif:GPSLatitude><exif:GPSLongitude>151,12,55.08E</exif:GPSLongitude>');
  assert.match(elem.GPS, /^-33\.856800, 151\.215300/);
  assert.strictEqual(xmpSummary('<exif:GPSLatitude>junk</exif:GPSLatitude>').GPS, undefined);
});

test('xmpSummary ignores coordinates outside geographic ranges', () => {
  for (const xml of [
    '<exif:GPSLatitude>91,0N</exif:GPSLatitude><exif:GPSLongitude>28,0E</exif:GPSLongitude>',
    '<exif:GPSLatitude>41,60N</exif:GPSLatitude><exif:GPSLongitude>28,0E</exif:GPSLongitude>',
    '<exif:GPSLatitude>41,0N</exif:GPSLatitude><exif:GPSLongitude>181,0E</exif:GPSLongitude>',
    '<exif:GPSLatitude>90,0.1N</exif:GPSLatitude><exif:GPSLongitude>28,0E</exif:GPSLongitude>'
  ]) assert.strictEqual(xmpSummary(xml).GPS, undefined);
});
