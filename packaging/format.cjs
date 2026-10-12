// Renders metadata as "• key: value" lines that fit one Discord embed field (1024 chars),
// cutting at a line boundary so a value is never chopped in half.
function formatField(obj, limit = 1024) {
  let out = '';
  for (const [k, v] of Object.entries(obj)) {
    let line = `• ${k}: ${v}`;
    if (line.length > 300) line = line.slice(0, 299) + '…';
    if (out.length + line.length + 1 > limit - 2) return out + '\n…';
    out += (out ? '\n' : '') + line;
  }
  return out;
}

module.exports = { formatField };
