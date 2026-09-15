const fs = require('fs');
const p = 'C:\\ARSLAN_CRM\\wacrm\\messages\\es.json';
const txt = fs.readFileSync(p, 'utf8');
const isDup = (txt.match(/"sendingMode"/g) || []).length;
const kinds = ['sendingMode','modeInstant','modeInstantDesc','modeSuperSafe','modeSuperSafeDesc','modeRow','estTime','superSafeEstimate','confirmInstant','confirmSuperSafe'];
const counts = {};
for (const k of kinds) counts[k] = (txt.match(new RegExp('"' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"', 'g')) || []).length;
console.log('DUPLICATE-BLOCK? sendingMode count =', isDup);
console.log(JSON.stringify(counts));
