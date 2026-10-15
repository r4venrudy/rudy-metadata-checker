// Turns exif-parser tags into the fields shown in the /metadata embed.
// exif-parser already converts GPS to signed decimal degrees and dates to Unix seconds.
function formatExifDate(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value || 'N/A';
  return new Date(value * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC');
}

function imageMetadata(tags = {}, { thumbnail = false } = {}) {
  const hasGps = typeof tags.GPSLatitude === 'number' && typeof tags.GPSLongitude === 'number';
  const metadata = {
    Camera: tags.Make || 'N/A',
    Model: tags.Model || 'N/A',
    Software: tags.Software || 'N/A',
    // phones and editors don't always write DateTimeOriginal; CreateDate is the next best capture time
    DateTaken: formatExifDate(tags.DateTimeOriginal ?? tags.CreateDate),
    GPS: hasGps
      ? `${tags.GPSLatitude.toFixed(6)}, ${tags.GPSLongitude.toFixed(6)} (https://maps.google.com/?q=${tags.GPSLatitude},${tags.GPSLongitude})`
      : 'None'
  };
  if (hasGps && typeof tags.GPSAltitude === 'number') {
    // GPSAltitudeRef 1 means below sea level
    metadata.Altitude = `${(tags.GPSAltitudeRef === 1 ? -tags.GPSAltitude : tags.GPSAltitude).toFixed(0)} m`;
  }
  if (hasGps && typeof tags.GPSImgDirection === 'number') {
    // which way the camera pointed; with the position it narrows down what the photo shows
    const deg = ((tags.GPSImgDirection % 360) + 360) % 360;
    const compass = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
    metadata.Facing = `${deg.toFixed(0)}° (${compass})`;
  }
  if (typeof tags.ModifyDate === 'number' && tags.ModifyDate !== (tags.DateTimeOriginal ?? tags.CreateDate)) {
    metadata.Modified = formatExifDate(tags.ModifyDate);
  }
  // Names and serial numbers tie a photo to a person or a specific camera; only shown when present
  const owner = tags.Artist || tags.OwnerName;
  const serial = tags.SerialNumber || tags.CameraSerialNumber;
  if (owner) metadata.Owner = String(owner).trim();
  if (tags.Copyright) metadata.Copyright = String(tags.Copyright).trim();
  if (serial) metadata.CameraSerial = String(serial).trim();
  // the lens serial identifies a lens as surely as the body serial does; ImageUniqueID links copies of
  // the same shot across sites; LensModel on phones names the device ("iPhone 14 Pro back camera")
  if (tags.LensModel) metadata.Lens = String(tags.LensModel).trim();
  if (tags.LensSerialNumber) metadata.LensSerial = String(tags.LensSerialNumber).trim();
  if (tags.ImageUniqueID) metadata.ImageUniqueID = String(tags.ImageUniqueID).trim();
  const sensitive = [];
  if (hasGps) sensitive.push('GPS Location');
  if (tags.Software) sensitive.push('Editing Software');
  if (owner) sensitive.push('Owner Name');
  if (serial) sensitive.push('Camera Serial Number');
  if (tags.LensSerialNumber) sensitive.push('Lens Serial Number');
  // editors often crop the photo but leave the EXIF thumbnail of the original untouched
  if (thumbnail) {
    metadata.Thumbnail = 'Embedded (may still show the original, uncropped image)';
    sensitive.push('Embedded Thumbnail');
  }
  return { metadata, sensitive };
}

module.exports = { formatExifDate, imageMetadata };
