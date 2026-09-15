const fs = require('fs');
const raw = fs.readFileSync('C:/ARSLAN_CRM/wacrm/messages/es.json', 'utf8');
console.log('LEN', raw.length, 'CRLF', raw.includes('\r\n'));
let verdict;
try { JSON.parse(raw); verdict = 'VALID'; }
catch (e) { verdict = 'INVALID: ' + e.message; }
console.log('parse:', verdict);
let n = 0, pos = -1;
while ((pos = raw.indexOf('"sendingMode"', pos + 1)) !== -1) { n++; console.log('sendingMode @', pos); }
console.log('sendingMode count:', n);
if (verdict.startsWith('INVALID')) {
  const m = verdict.match(/position (\d+)/);
  const p = m ? Number(m[1]) : 0;
  console.log('neighborhood:', JSON.stringify(raw.slice(p - 30, p + 20)));
}
