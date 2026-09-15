var fs = require('fs');
var p = 'C:\\ARSLAN_CRM\\wacrm\\messages\\es.json';
var raw = fs.readFileSync(p, 'utf8');
var norm = raw.replace(/\r\n/g, '\n');
var out = 'CRLF present in file: ' + (raw.indexOf('\r\n') !== -1) + '\n';
out += 'sendingMode count: ' + (norm.match(/"sendingMode"/g) || []).length + '\n';
out += 'estTime count: ' + (norm.match(/"estTime"/g) || []).length + '\n';
out += 'superSafeEstimate count: ' + (norm.match(/"superSafeEstimate"/g) || []).length + '\n';
out += 'confirmSuperSafe count: ' + (norm.match(/"confirmSuperSafe"/g) || []).length + '\n';
try { JSON.parse(norm); out += 'PARSE (CRLF -> LF): VALID\n'; }
catch (e) { out += 'PARSE (CRLF -> LF): INVALID ' + e.message + '\n'; }
try { JSON.parse(raw); out += 'PARSE (raw): VALID\n'; }
catch (e) { out += 'PARSE (raw): INVALID ' + e.message.split(' at ')[0] + '\n'; }
fs.writeFileSync('C:\\ARSLAN_CRM\\wacrm\\messages-es-parser.txt', out, 'utf8');
console.log(out);
