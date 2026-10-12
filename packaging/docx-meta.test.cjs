const test = require('node:test');
const assert = require('node:assert');
const { docxMetadata } = require('./docx-meta.cjs');

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
  assert.throws(() => docxMetadata(Buffer.from('not a zip')), /Not a valid DOCX/);
});
