const fs = require('fs');
const p = 'C:/ARSLAN_CRM/wacrm/messages/es.json';
const raw = fs.readFileSync(p, 'utf8');
let ok = true, msg = 'OK';
try { JSON.parse(raw); } catch (e) { ok = false; msg = e.message; }
console.log('parse es:', ok ? 'VALID' : 'INVALID ' + msg);
console.log('len', raw.length);
const needle = '"sendingMode"';
let idx = -1, n = 0;
while ((idx = raw.indexOf(needle, idx + 1)) !== -1) { n++; console.log('at', idx); }
console.log('sendingMode count:', n);
const est = '"estTime"';
let ei = -1, en = 0;
while ((ei = raw.indexOf(est, ei + 1)) !== -1) { en++; console.log('estTime at', ei); }
console.log('estTime count:', en);
if (!ok) {
  const m = msg.match(/position (\d+)/);
  const pos = m ? Number(m[1]) : -1;
  console.log('error pos:', pos);
  if (pos > -1) {
    console.log('context:', JSON.stringify(raw.slice(pos - 40, pos + 30)));
    const before = raw.slice(0, pos);
    const lines = before.split('\n');
    console.log('line:', lines.length, 'col:', pos - before.lastIndexOf('\n'));
  }
}
