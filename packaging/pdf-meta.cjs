// Turns the PDF Info dictionary into embed fields. PDF dates look like "D:20240102030405+03'00'".
function formatPdfDate(value) {
  if (!value) return 'N/A';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 'N/A' : value.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const m = String(value).match(/^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(Z|[+-]\d{2}'?\d{2}'?)?/);
  if (!m) return String(value);
  const [, y, mo = '01', d = '01', h = '00', mi = '00', s = '00', tz] = m;
  const zone = !tz || tz === 'Z' ? 'UTC' : `UTC${tz.replace(/'/g, '').replace(/(\d{2})(\d{2})$/, '$1:$2')}`;
  return `${y}-${mo}-${d} ${h}:${mi}:${s} ${zone}`;
}

function pdfMetadata(info = {}) {
  const metadata = {
    Title: info.Title || 'N/A',
    Author: info.Author || 'N/A',
    Creator: info.Creator || 'N/A',
    Producer: info.Producer || 'N/A',
    Created: formatPdfDate(info.CreationDate),
    Modified: formatPdfDate(info.ModDate)
  };
  const sensitive = [];
  if (info.Author) sensitive.push('Author Name');
  if (info.Creator || info.Producer) sensitive.push('Editing Software');
  return { metadata, sensitive };
}

module.exports = { formatPdfDate, pdfMetadata };
