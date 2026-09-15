const fs = require('fs');
const P = 'C:\\ARSLAN_CRM\\wacrm\\messages\\es.json';
const a = fs.readFileSync(P, 'utf8').split('\n');
for (let n = 844; n <= 854; n++) {
  console.log((n) + ' | ' + a[n - 1]);
}
