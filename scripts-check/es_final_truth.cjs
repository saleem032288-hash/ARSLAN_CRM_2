var fs = require('fs');
var p = 'C:\\ARSLAN_CRM\\wacrm\\messages\\es.json';
var raw = fs.readFileSync(p, 'utf8');
var out = '';
out += 'has CRLF: ' + (raw.indexOf('\r\n') !== -1) + '\n';
var norm = raw.replace(/\r\n/g, '\n');
try { JSON.parse(raw); out += 'parse(raw): VALID\n'; }
catch (e) { out += 'parse(raw): INVALID -> ' + e.message + '\n'; }
try { JSON.parse(norm); out += 'parse(crlf-normalized): VALID\n'; }
catch (e) { out += 'parse(crlf-normalized): INVALID -> ' + e.message + '\n'; }
var sendingModeCount = (raw.match(/"sendingMode"/g) || []).length;
out += 'sendingMode occurrences: ' + sendingModeCount + '\n';
var estTimeCount = (raw.match(/"estTime"/g) || []).length;
out += 'estTime occurrences: ' + estTimeCount + '\n';
var confirmSuperSafeCount = (raw.match(/"confirmSuperSafe"/g) || []).length;
out += 'confirmSuperSafe occurrences: ' + confirmSuperSafeCount + '\n';
var modeSuperSafeCount = (raw.match(/"modeSuperSafe"/g) || []).length;
out += 'modeSuperSafe occurrences: ' + modeSuperSafeCount + '\n';
fs.writeFileSync('C:\\ARSLAN_CRM\\wacrm\\messages\\_es_checkout.txt', out, 'utf8');
console.log(out);
