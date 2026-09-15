var fs = require('fs');
var p = 'C:\\ARSLAN_CRM\\wacrm\\messages\\es.json';
var b = fs.readFileSync(p);
var raw = b.toString('utf8');
var CH = '\r', LF = '\n', EQ = '=', DASH = '-', PIPE = '|';
var report = '';
var parseOk = true; var parseMsg = '';
try { JSON.parse(raw); } catch (e) { parseOk = false; parseMsg = e.message; }
report += 'PARSE: ' + (parseOk ? 'VALID' : 'INVALID  ' + parseMsg) + LF;
report += 'size bytes: ' + b.length + LF;
for (var i = 1; i <= 6; i++) {
  var pos = 39326 + i - 3;
  var hex = '';
  for (var k = 0; k < 8; k++) {
    var off = pos + k;
    if (off < 0 || off >= b.length) break;
    hex += (off >= 0 ? b[off].toString(16).toUpperCase() : '--') + ' ';
  }
  report += 'bytes @' + pos + ' ~>' + DASH + '> ' + hex.trim() + LF;
}
var strAfter = raw.substr(39326, 16);
report += 'text after 39326: ' + JSON.stringify(strAfter) + LF;
fs.writeFileSync('C:\\ARSLAN_CRM\\wacrm\\messages\\_es_hex_truth.txt', report, 'utf8');
console.log(report.split(LF).join(' '));
