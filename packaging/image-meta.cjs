// Turns exif-parser tags into the fields shown in the /metadata embed.
// exif-parser already converts GPS to signed decimal degrees and dates to Unix seconds.
function formatExifDate(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value || 'N/A';
  return new Date(value * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC');
}

function imageMetadata(tags = {}) {
  const hasGps = typeof tags.GPSLatitude === 'number' && typeof tags.GPSLongitude === 'number';
  const metadata = {
    Camera: tags.Make || 'N/A',
    Model: tags.Model || 'N/A',
    Software: tags.Software || 'N/A',
    DateTaken: formatExifDate(tags.DateTimeOriginal),
    GPS: hasGps
      ? `${tags.GPSLatitude.toFixed(6)}, ${tags.GPSLongitude.toFixed(6)} (https://maps.google.com/?q=${tags.GPSLatitude},${tags.GPSLongitude})`
      : 'None'
  };
  const sensitive = [];
  if (hasGps) sensitive.push('GPS Location');
  if (tags.Software) sensitive.push('Editing Software');
  return { metadata, sensitive };
}

module.exports = { formatExifDate, imageMetadata };
