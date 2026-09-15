const fs = require('fs');
const raw = fs.readFileSync('C:/ARSLAN_CRM/wacrm/messages/es.json', 'utf8');
const seg = raw.slice(39040, 39460);
console.log(seg);
