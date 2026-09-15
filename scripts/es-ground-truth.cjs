const fs = require('fs');
const path = String.fromCharCode(67,58,92,65,82,83,76,65,78,95,67,82,77,92,119,97,99,114,109,92,109,101,115,115,97,103,101,115,92,101,115,46,106,115,111,110);
const raw = fs.readFileSync(path, 'utf8');
const NL = String.fromCharCode(10);
const lines = raw.split(NL);
console.log('total lines:', lines.length, '  chars:', raw.length);
let verdict;
try { JSON.parse(raw); verdict = 'VALID'; }
catch (e) { verdict = 'INVALID: ' + e.message; }
console.log('parse:', verdict);
for (let i = 844; i <= 858; i++) {
  const l = lines[i];
  const shown = l === undefined ? '<UNDEFINED>' : (l.length > 20 ? l.slice(0, 18) + '...' + l.slice(-8) : l);
  console.log('L' + (i + 1) + ' [' + shown + ']');
}
