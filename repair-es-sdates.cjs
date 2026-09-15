const fs = require('fs');
const F = 'C:/ARSLAN_CRM/wacrm/messages/es.json';
const raw = fs.readFileSync(F, 'utf8');

function parseTry(s) {
  try { JSON.parse(s); return true; } catch (e) { return false; }
}

console.log('before valid:', parseTry(raw));

function findStringIndex(s, needle, from) {
  let i = from;
  while (true) {
    i = s.indexOf(needle, i);
    if (i === -1) return -1;
    if (s[i - 1] === '\\') { i++; continue; }
    return i;
  }
}

function findOpenBlock(s, keyStartIdx) {
  let i = keyStartIdx;
  while (i < s.length) {
    const c = s[i];
    if (c === ':') { i++; break; }
    i++;
  }
  while (i < s.length && /\s/.test(s[i])) i++;
  if (s[i] === '{') return i;
  return -1;
}

function findCloseBlock(s, openIdx) {
  let depth = 0, quote = false, esc = false;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') quote = false;
      continue;
    }
    if (c === '"') { quote = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const KEY = '"scheduleSend"';
const positions = [];
{
  let from = 0;
  while (true) {
    const i = findStringIndex(raw, KEY, from);
    if (i === -1) break;
    positions.push(i);
    from = i + KEY.length;
  }
}
console.log('scheduleSend key positions:', JSON.stringify(positions));

if (positions.length <= 1) {
  console.log('Nothing to collapse. Final valid:', parseTry(raw));
  process.exit(0);
}

const first = positions[0];
const firstOpen = findOpenBlock(raw, first);
const firstClose = findCloseBlock(raw, firstOpen熬夜);
console.log('first block open/close:', firstOpen, firstClose);

const segments = [raw.slice(0, firstClose + 1)];
for (let k = 1; k < positions.length; k++) {
  const open = findOpenBlock(raw, positions[k]);
  const close = findCloseBlock(raw, open);
  let idx = close + 1;
  while (idx < raw.length && /\s/.test(raw[idx])) idx++;
  if (idx < raw.length && raw[idx] === ',') idx++;
  segments.push(raw.slice(idx));
}
const rebuilt = segments.join('');

console.log('rebuilt valid:', parseTry(rebuilt));
if (parseTry(rebuilt)) {
  fs.writeFileSync(F, rebuilt, 'utf8');
  console.log('WROTE es.json');
  console.log('after valid:', parseTry(fs.readFileSync(F, 'utf8')));
} else {
  console.log('NOT written');
}
