const fs = require('fs');
const p = 'C:/ARSLAN_CRM/wacrm/messages/es.json';
const raw = fs.readFileSync(p, 'utf8');
const lines = raw.replace(/\r/g, '').split('\n');
console.log('total lines:', lines.length);
for (let i = 838; i <= Math.min(870, lines.length - 1); i++) {
  console.log((i + 1) + ': ' + lines[i]);
}
