const test = require('node:test');
const assert = require('node:assert');
const { formatExifDate, imageMetadata } = require('./image-meta.cjs');

test('formats Unix seconds as UTC', () => {
  assert.strictEqual(formatExifDate(1700000000), '2023-11-14 22:13:20 UTC');
  assert.strictEqual(formatExifDate(undefined), 'N/A');
});

test('flags GPS and software as sensitive', () => {
  const { metadata, sensitive } = imageMetadata({ Make: 'Apple', GPSLatitude: 41.0082, GPSLongitude: -28.9784, Software: 'Photoshop' });
  assert.strictEqual(metadata.Camera, 'Apple');
  assert.match(metadata.GPS, /^41\.008200, -28\.978400 \(https:\/\/maps\.google\.com\/\?q=41\.0082,-28\.9784\)$/);
  assert.deepStrictEqual(sensitive, ['GPS Location', 'Editing Software']);
});

test('no tags means nothing sensitive', () => {
  const { metadata, sensitive } = imageMetadata({});
  assert.strictEqual(metadata.GPS, 'None');
  assert.deepStrictEqual(sensitive, []);
});

test('owner, copyright and camera serial are shown and flagged', () => {
  const { metadata, sensitive } = imageMetadata({ Artist: 'Jane Doe ', Copyright: '(c) Jane', SerialNumber: '0123456789' });
  assert.strictEqual(metadata.Owner, 'Jane Doe');
  assert.strictEqual(metadata.Copyright, '(c) Jane');
  assert.strictEqual(metadata.CameraSerial, '0123456789');
  assert.deepStrictEqual(sensitive, ['Owner Name', 'Camera Serial Number']);
});

test('falls back to CreateDate and shows a later ModifyDate', () => {
  const { metadata } = imageMetadata({ CreateDate: 1700000000, ModifyDate: 1700003600 });
  assert.strictEqual(metadata.DateTaken, '2023-11-14 22:13:20 UTC');
  assert.strictEqual(metadata.Modified, '2023-11-14 23:13:20 UTC');
  assert.strictEqual(imageMetadata({ DateTimeOriginal: 1700000000, ModifyDate: 1700000000 }).metadata.Modified, undefined);
});

test('an embedded EXIF thumbnail is shown and flagged', () => {
  const { metadata, sensitive } = imageMetadata({}, { thumbnail: true });
  assert.match(metadata.Thumbnail, /uncropped/);
  assert.deepStrictEqual(sensitive, ['Embedded Thumbnail']);
  assert.strictEqual(imageMetadata({}).metadata.Thumbnail, undefined);
});

test('GPS altitude is shown with its sign', () => {
  const gps = { GPSLatitude: 41, GPSLongitude: 29 };
  assert.strictEqual(imageMetadata({ ...gps, GPSAltitude: 123.4 }).metadata.Altitude, '123 m');
  assert.strictEqual(imageMetadata({ ...gps, GPSAltitude: 12, GPSAltitudeRef: 1 }).metadata.Altitude, '-12 m');
  assert.strictEqual(imageMetadata({ GPSAltitude: 5 }).metadata.Altitude, undefined);
});

test('lens model, lens serial and image unique ID are shown', () => {
  const { metadata, sensitive } = imageMetadata({ LensModel: 'iPhone 14 Pro back triple camera 6.86mm f/1.78', LensSerialNumber: 'L998877', ImageUniqueID: 'a1b2c3' });
  assert.strictEqual(metadata.Lens, 'iPhone 14 Pro back triple camera 6.86mm f/1.78');
  assert.strictEqual(metadata.LensSerial, 'L998877');
  assert.strictEqual(metadata.ImageUniqueID, 'a1b2c3');
  assert.ok(sensitive.includes('Lens Serial Number'));
});

test('camera direction is shown with a compass point', () => {
  const tags = { GPSLatitude: 41, GPSLongitude: 29 };
  assert.strictEqual(imageMetadata({ ...tags, GPSImgDirection: 134.6 }).metadata.Facing, '135° (SE)');
  assert.strictEqual(imageMetadata({ ...tags, GPSImgDirection: 359 }).metadata.Facing, '359° (N)');
  assert.strictEqual(imageMetadata({ GPSImgDirection: 90 }).metadata.Facing, undefined);
});
