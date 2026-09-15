const fs = require('fs');
const p = 'C:/ARSLAN_CRM/wacrm/vt-a.txt';
const x = fs.readFileSync(p, 'utf8');
const clean = x
  .replace(/\u001b\[\d+(;\d+)*m/g, '')
  .replace(/\r/g, '');
const lines = clean.split('\n');
let out = [];
for (const l of lines) {
  if (/tests\s+\d|Tests\s+\d|passed|failed|FAIL|PASS|missing|covers|orphan|placeholder|INVALID|invalid|VALID|✓|×|\.json/.test(l)) out.push(l);
}
fs.writeFileSync('C:/ARSLAN_CRM/wacrm/vt-sum.txt', out.join('\n'), 'utf8');
console.log('summary lines:', out.length);
