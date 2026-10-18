const test = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');
const { docxMetadata, decodeXml, readZipEntry } = require('./docx-meta.cjs');

function zipFile(name, contents, method = 8) {
  const filename = Buffer.from(name);
  const compressed = method === 8 ? zlib.deflateRawSync(contents) : contents;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(contents.length, 22);
  local.writeUInt16LE(filename.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(contents.length, 24);
  central.writeUInt16LE(filename.length, 28);
  const directory = Buffer.concat([central, filename]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(local.length + filename.length + compressed.length, 16);
  return Buffer.concat([local, filename, compressed, directory, eocd]);
}

// Minimal DOCX (deflate-compressed ZIP) with core.xml and app.xml
const SAMPLE = Buffer.from('UEsDBBQAAAAIAAgRTF3HHBc8CgAAAAgAAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbLMJqSxILda3AwBQSwMEFAAAAAgACBFMXZ/5XevRAAAASgEAABEAAABkb2NQcm9wcy9jb3JlLnhtbGWQQUsDMRCF/0qYg7fadLcixGQKtXgoCBUKgreQTDWwm4Qkll1/vWZtK8Xje++b4c3I1dB37Egpu+AVLG45rFCaKExItEshUiqOMvuhfBYmKhjgJKxRMP6JQqnPCr4ApTWiuNIRvrRs12nPbnQfH9j6075TkfNLXEGTSJeQcKs9sU2gKT6btUinc3kO1h0c2fWI2/Dh5fy/X9FER1fvwPuJuEh5ave7lywbshNljKTgnLy2j5v9E2DDm+WML2a82fNW8KXgd2+10tU8TuuvP4TfUEsDBBQAAAAIAAgRTF3t2NUySQAAAGAAAAAQAAAAZG9jUHJvcHMvYXBwLnhtbLMJKMovSC0qyUwttrNxLCjIyUxOLMnMz7PzzUwuyi/OTytR8E9Ly0xOVQjPL0qx0UdWYuOcn1uQmFdp55icm2qjD+PZ6COZCQBQSwECFAMUAAAACAAIEUxdxxwXPAoAAAAIAAAAEwAAAAAAAAAAAAAAgAEAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUAxQAAAAIAAgRTF2f+V3r0QAAAEoBAAARAAAAAAAAAAAAAACAATsAAABkb2NQcm9wcy9jb3JlLnhtbFBLAQIUAxQAAAAIAAgRTF3t2NUySQAAAGAAAAAQAAAAAAAAAAAAAACAATsBAABkb2NQcm9wcy9hcHAueG1sUEsFBgAAAAADAAMAvgAAALIBAAAAAA==', 'base64');

test('reads core and app properties', () => {
  const { metadata, sensitive } = docxMetadata(SAMPLE);
  assert.strictEqual(metadata.Title, 'Q3 Plan & Budget');
  assert.strictEqual(metadata.Author, 'Jane Doe');
  assert.strictEqual(metadata.LastModifiedBy, 'John');
  assert.strictEqual(metadata.Revision, '7');
  assert.strictEqual(metadata.Created, '2024-01-02T03:04:05Z');
  assert.strictEqual(metadata.Modified, 'N/A');
  assert.strictEqual(metadata.Application, 'Microsoft Office Word');
  assert.deepStrictEqual(sensitive, ['Author Name', 'Company Name']);
});

test('rejects files that are not ZIP archives', () => {
  assert.throws(() => docxMetadata(Buffer.from('not a zip')), /Not a valid Office/);
});

test('bounds expanded Office XML even when ZIP data is highly compressed', () => {
  const oversized = zipFile('docProps/core.xml', Buffer.alloc(2 * 1024 * 1024, 65));
  assert.throws(() => readZipEntry(oversized, 'docProps/core.xml'), /exceeds 1 MiB/);
});

test('bounds uncompressed Office metadata entries', () => {
  const oversized = zipFile('docProps/core.xml', Buffer.alloc(1024 * 1024 + 1, 65), 0);
  assert.throws(() => readZipEntry(oversized, 'docProps/core.xml'), /exceeds 1 MiB/);
});

test('decodeXml handles quotes, numeric entities and escaped ampersands', () => {
  assert.strictEqual(decodeXml('O&apos;Brien &quot;Q3&quot;'), 'O\'Brien "Q3"');
  assert.strictEqual(decodeXml('&#350;ahin &#x11F;'), 'Şahin ğ');
  assert.strictEqual(decodeXml('a &amp;lt; b'), 'a &lt; b');
});

test('reports page and word counts, template and editing time from app.xml', () => {
  const file = Buffer.from('UEsDBBQAAAAIAJART11rVdfnQgAAAF0AAAARAAAAZG9jUHJvcHMvY29yZS54bWyzSS6wSs4vSg0oyi9ILSrJTC1WqMjNySu2Si6wVapQgnJSkm2VKpXsbFKSrZKLUhNL8ovsHPPybPSR+Db6GCbZAQBQSwMEFAAAAAgAkBFPXU9tRs96AAAAqgAAABAAAABkb2NQcm9wcy9hcHAueG1sTY7NCsIwEIRfpS+gof6AhyUgnsVSAp5DupGF1F02e/DxTSlUb98ww8fAoCyoRlg9BJylREN/Y5XdiMJq+4ntA26rILDFEmhG3x/PrdgiDPHVLCdwK8CTdar+0h/ArQhXkUIpGvHb3ykpV87WPXKmhN2yAfc/aabfuy9QSwECFAMUAAAACACQEU9da1XX50IAAABdAAAAEQAAAAAAAAAAAAAAgAEAAAAAZG9jUHJvcHMvY29yZS54bWxQSwECFAMUAAAACACQEU9dT21Gz3oAAACqAAAAEAAAAAAAAAAAAAAAgAFxAAAAZG9jUHJvcHMvYXBwLnhtbFBLBQYAAAAAAgACAH0AAAAZAQAAAAA=', 'base64');
  const { metadata } = docxMetadata(file);
  assert.strictEqual(metadata.Pages, '4');
  assert.strictEqual(metadata.Words, '812');
  assert.strictEqual(metadata.Template, 'Corp-Report.dotx');
  assert.strictEqual(metadata.EditingTime, '2 h 15 min');
  assert.strictEqual(metadata.Slides, undefined);
});
