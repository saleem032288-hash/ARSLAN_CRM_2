const fs = require('fs');
const cwd = 'C:/ARSLAN_CRM/wacrm';
const must = ['src/lib/whatsapp/super-safe-rate-limit.ts','src/lib/whatsapp/broadcast-core.ts','src/app/api/whatsapp/broadcast/route.ts','src/lib/whatsapp/broadcast-resume.ts'];
for (const f of must) console.log(f.padEnd(52), fs.existsSync(cwd + '/' + f));
console.log('--- super-safe refs to en/icu keys (test-relevant) ---');
['estTime','superSafeEstimate','confirmSuperSafe','modeSuperSafe','sendingMode','modeRow'].forEach((k) => {
  const n = (fs.readFileSync(cwd + '/messages/en.json', 'utf8').match(new RegExp('"' + k + '"', 'g')) || []).length;
  console.log('en.json ' + k.padEnd(20) + ' occ: ' + n);
});
