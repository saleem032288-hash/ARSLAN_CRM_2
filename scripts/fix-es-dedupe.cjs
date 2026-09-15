const fs = require('fs');
const FILE = 'C:/ARSLAN_CRM/wacrm/messages/es.json';

const raw = fs.readFileSync(FILE, 'utf8');

function verdict(s) {
  try { JSON.parse(s); return 'VALID'; }
  catch (e) { return 'INVALID: ' + e.message; }
}

console.log('before:', verdict(raw));

const OUTER = '"scheduleSend"';
let first = raw.indexOf(OUTER);
if (first === -1) { console.log('no scheduleSend key'); process.exit(1); }
let second = raw.indexOf(OUTER, first + 1);
console.log('scheduleSend occurrences:', second === -1 ? 'one' : 'two');

if (second === -1) {
  console.log('after: ' + verdict(raw) + '  -> nothing to do');
  process.exit(0);
}

function tokenize(s, start) {
  const toks = [];
  let i = start;
  let depth = 0;
  let str = false;
  let esc = false;
  while (i < s.length) {
    const c = s[i];
    if (str) {
      if (esc) { esc = false; }
      else if (c === '\\') { esc = true; }
      else if (c === '"') { str = false; }
      i++;
      continue;
    }
    if (c === '"') { str = true; toks.push(i); i++; continue; }
    if (c === '{') { depth++; toks.push(i); i++; continue; }
    if (c === '}') { toks.push(i); depth--; if (depth <= 0) break; i++; continue; }
    i++;
  }
  return toks;
}

function objectEnd(s, openIdx) {
  const toks = tokenize(s, openIdx);
  let depth = 0;
  for (const t of toks) {
    if (s[t] === '{') depth++;
    else if (s[t] === '}') {
      depth--;
      if (depth === 0) return t;
    }
  }
  return -1;
}

const open1 = first + OUTER.length;
let maybeColon1 = open1;
while (raw[maybeColon1] !== ':') maybeColon1++;
let brace1 = maybeColon1 + 1;
while (/\s/.test(raw[brace1])) brace1++;
const close1 = objectEnd(raw, brace1);
if (close1 === -1) { console.log('could not bound first object'); process.exit(1); }

const open2 = second + OUTER.length;
let maybeColon2 = open2;
while (raw[maybeColon2] !== ':') maybeColon2++;
let brace2 = maybeColon2 + 1;
while (/\s/.test(raw[brace2])) brace2++;
const close2 = objectEnd(raw, brace2);
if (close2 === -1) { console.log('could not bound second object'); process.exit(1); }

console.log('first block:', first, '..', close1);
console.log('second block:', second, '..', close2与本', close2);

let comma = close2 + 1;
while (/\s/.test(raw[comma])) comma++;
let newRaw;
if (raw[comma] === ',') {
  newRaw = raw.slice(0, close1 + 1) + raw.slice(comma + 1);
} else {
  newRaw = raw.slice(0, close2 + 1);
}

console.log('after: ' + verdict(newRaw));
if (verdict(newRaw) === 'VALID') {
  fs.writeFileSync(FILE, newRaw, 'utf8');
  console.log('WROTE fixed es.json');
} else {
  console.log('NOT written (new content invalid)');
}
