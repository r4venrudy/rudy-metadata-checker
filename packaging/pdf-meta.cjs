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
  if (info.Subject) metadata.Subject = info.Subject;
  if (info.Keywords) metadata.Keywords = info.Keywords;
  if (Number.isInteger(info.Pages)) metadata.Pages = info.Pages;
  const sensitive = [];
  if (info.Author) sensitive.push('Author Name');
  if (info.Creator || info.Producer) sensitive.push('Editing Software');
  return { metadata, sensitive };
}

// Active content a reader may run or open. Names are matched in the raw file, so anything packed
// inside compressed object streams is not seen; a hit is reliable, a miss is not a guarantee.
const ACTIVE = [
  [/\/(JavaScript|JS)(?![A-Za-z0-9])/, 'JavaScript'],
  [/\/OpenAction(?![A-Za-z0-9])|\/AA(?![A-Za-z0-9])/, 'Automatic action on open'],
  [/\/Launch(?![A-Za-z0-9])/, 'Launch action (runs a program)'],
  [/\/EmbeddedFiles?(?![A-Za-z0-9])/, 'Embedded file'],
];

function pdfActiveContent(buffer) {
  const text = buffer.toString('latin1');
  return ACTIVE.filter(([re]) => re.test(text)).map(([, label]) => label);
}

module.exports = { formatPdfDate, pdfMetadata, pdfActiveContent };
