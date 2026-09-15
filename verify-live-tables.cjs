const fs = require('fs');
const path = require('path');

const base = 'C:/ARSLAN_CRM/wacrm';
const migDir = path.join(base, 'supabase', 'migrations');
const envFile = path.join(base, '.env.local');

function maskKey(k) {
  return k && k.length > 10 ? k.slice(0, 6) + '...' + k.slice(-4) : '(none)';
}

let env = {};
try {
  const r = fs.readFileSync(envFile, 'utf8');
  for (const line of r.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
} catch (e) {
  console.error('env read fail', e.message);
  process.exit(2);
}

const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '';
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const svc = env.SUPABASE_SERVICE_ROLE_KEY || '';
console.log('url  ', url);
console.log('anon ', maskKey(anon));
console.log('svc  ', maskKey(svc));
if (!url || !anon) {
  console.error('missing url/anon');
  process.exit(2);
}

const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
const tables = new Set();
const createRe = /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\.)?("?[a-z_0-9]+"?)/gi;
const alterRe = /\balter\s+table\s+(?:if\s+exists\s+)?(?:"?public"?\.)?("?[a-z_0-9]+"?)/gi;

for (const f of files) {
  const txt = fs.readFileSync(path.join(migDir, f), 'utf8');
  let m;
  while ((m = createRe.exec(txt))) tables.add(m[1].replace(/"/g, ''));
  while ((m = alterRe.exec(txt))) tables.add(m[1].replace(/"/g, ''));
}

const list = [...tables].filter((t) => !/^(_|pg_|supabase)/.test(t)).sort();
console.log('tables from migrations:', list.lengthamon');
console.log(list.join(','));

async function restHead(table) {
  const u = url.replace(/\/$/, '') + '/rest/v1/' + encodeURIComponent(table) + '?select=*&limit=1';
  const r = await fetch(u, { headers: { apikey: anon, Authorization: 'Bearer ' + anon } });
  if (r.status === 200) {
    return { ok: true, rows: (await r.json()).length };
  }
  if (r.status === 404) return { ok: false, why: 'no such API table/relation' };
  if (r.status === 401) return { ok: false, why: 'anon denied (RLS/grants?)' };
  const body = await r.text().catch(() => '');
  return { ok: false, why: 'http_' + r.status + '_' + body.slice(0, 60) };
}

(async () => {
  const byStatus = { ok: [], missing: [], denied: [] };
  for (const t of Object.keys(list)) {
    const table = list[t];
    const res = await restHead(table);
    const tag = res.ok ? 'OK' : res.why === 'no such API table/relation' ? 'MISSING' : 'BLOCKED';
    console.log((t + 1).toString().padStart(2) + '. ' + table.padEnd(24) + ' ' + tag + (res.ok ? ' rows>=1 (limit1)' : ' -> ' + res.why));
    if (res.ok) byStatus.ok.push(table);
    else if (tag === 'MISSING') byStatus.missing.push(table);
    else byStatus.denied.push(table);
  }
  console.log('---');
  console.log('REST-visible (200): ' + byStatus.ok.length);
  console.log('MISSING  (404)   : ' + byStatus.missing.length + (byStatus.missing.length ? ' -> ' + byStatus.missing.join(',') : ''));
  console.log('BLOCKED  (rls)   : ' + byStatus.denied.length + (byStatus.denied.length ? ' -> ' + byStatus.denied.join(',') : ''));
})().catch((e) => { console.error('fatal', e); process.exitCode = 1; });
