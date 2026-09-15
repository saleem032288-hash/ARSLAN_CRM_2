var fs = require('fs');
var raw = fs.readFileSync('C:\\ARSLAN_CRM\\wacrm\\messages\\es.json', 'utf8');
var ok = true, err = '';
try { JSON.parse(raw); } catch (e) { ok = false; err = e.message; }
console.log('parse ok:', ok);
console.log('parse err:', err);
var lines = raw.split('\n');
console.log('lines:', lines.length);
for (var i = 844; i <= 853; i++) {
  console.log((i + 1) + ': [' + lines[i].replace(/\r$/, '') + ']');
}
