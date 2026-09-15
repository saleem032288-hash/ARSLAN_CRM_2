const fs = require('fs');
const path = require('path');
const dir = 'C:/ARSLAN_CRM/wacrm/supabase/migrations';
const out = [];
for (const f of fs.readdirSync(dir).sort()) {
  if (!f.endsWith('.sql')) continue;
  const sq = fs.readFileSync(path.join(dir, f), 'utf8');
  const createTables = [...sq.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_0-9]+)/gi)].map((m) => m[1]);
  if (createTables.length) out.push(f + '  ->  ' + createTables.join(', '));
}
console.log(out.join('\n'));
