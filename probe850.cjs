const fs = require('fs');
const raw = fs.readFileSync('C:/ARSLAN_CRM/wacrm/messages/es.json', 'utf8');
console.log('LEN', raw.length);
const A = 39326 - 12;
console.log(JSON.stringify(raw.slice(A, A + 20)));
console.log('CRLF?', raw.includes('\r\n'));
