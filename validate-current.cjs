const fs = require('fs');
const cwd = 'C:/ARSLAN_CRM/wacrm';
for (const f of ['messages/en.json','messages/es.json','messages/pt.json','messages/ko.json']) {
  const raw = fs.readFileSync(cwd + '/' + f, 'utf8');
  let v; try { JSON.parse(raw); v = 'VALID'; } catch (e) { v = 'INVALID: ' + e.message; }
  console.log(f, v, 'len', raw.length);
}
