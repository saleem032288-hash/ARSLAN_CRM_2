const fs = require('fs');
const P = 'C:\\ARSLAN_CRM\\wacrm\\messages\\es.json';
const raw = fs.readFileSync(P, 'utf8');
let valid;
try { JSON.parse(raw); valid = 'VALID'; } catch (e) { valid = 'INVALID: ' + e.message.split('\n')[0]; }
console.log('es.json parse =>', valid);
console.log('has carriage returns:', raw.indexOf('\r') !== -1);
console.log('total chars:', raw.length);
