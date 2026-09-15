const fs = require('fs');
const path = require('path');
const dir = 'C:/ARSLAN_CRM/wacrm/supabase/migrations';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const tableRe = /^\s*create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?(?:public\.)?"?[a-z_0-9]+\.)?("?[a-z_0-9]+"?)/im;
const alterRe = /^\s*alter\s+table\s+(?:if\s+exists\s+)?(?:"?(?:public\.)?"?[a-z_0-9]+\.)?("?[a-z_0-9]+"?)/im;
const tables = new Map();
for (const f of files) {
  const text = fs.readFileSync(path.join(dir, f), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    let m = line.match(tableRe);
    const kind = m ? 'CREATE' : null;
    if (!m) { m = line.match(alterRe); }
    if (m) {
      const name = m[1].replace(/"/g, '').toLowerCase();
      if (name && !name.startsWith('_'))
        if (kind === 'CREATE' || !tables.has(name))
          tables.set(name, { createdIn: kind === 'CREATE' ? f : (tables.get(name)?.createdIn || f), alters: (tables.get(name)?.alters || 0) + (kind ?  LinesAuth : 1) });
    }
  }
}
const sorted = [...tables.keys()].sort();
console.log('TABLES from migrations (' + sorted.length + '):');
for (const t of sorted) console.log('  ' + t.padEnd(28) + ' -> ' + tables.get(t).createdIn);
