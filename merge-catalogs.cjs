const fs = require('fs');
const path = require('path');

const M = 'C:/ARSLAN_CRM/wacrm/messages';
const LOC = ['es', 'pt', 'ko'];

function read(f) {
  return fs.readFileSync(path.join(M, f), 'utf8');
}

function validate(s) {
  try {
    JSON.parse(s);
    return true;
  } catch (e) {
    return false;
  }
}

function findSpan(raw, openIdx, closeIdx) {
  let depth = 0, inStr = false, esc = false;
  for (let i = openIdx; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) { closeIdx[0] = i; return true; }
    }
  }
  return false;
}

const EN = JSON.parse(read('en.json'));

function leaves(obj, prefix, out) {
  for (const k of Object.keys(obj)) {
    const p = prefix ? prefix + '.' + k : k;
    const v = obj[k];
    if (v && typeof v === 'object') leaves(v, p, out);
    else out[p] = v;
  }
  return out;
}

const EN_LEAVES = leaves(EN, '', {});

function buildLocale(locale, rawFallback) {
  let parsed = null;
  try {
    parsed = JSON.parse(rawFallback);
  } catch (e) {
    parsed = null;
  }
  const localeLeaves = parsed ? leaves(parsed, '', {}) : {};

  const enTree = {};
  for (const [p, v] of Object.entries(EN_LEAVES)) {
    const parts = p.split('.');
    let node = enTree;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) node[part] = v;
      else {
        if (typeof node[part] !== 'object' || node[part] === null) node[part] = {};
        node = node[part];
      }
    });
  }

  function applyLeaf(tree, parts, value) {
    const key = parts[parts.length - 1];
    let node = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      node = node[parts[i]];
    }
    node[key] = value;
  }

  for (const [p, localeVal] of Object.entries(localeLeaves)) {
    if (Object.prototype.hasOwnProperty.call(EN_LEAVES, p)) {
      applyLeaf(enTree, p.split('.'), localeVal);
    }
  }

  return JSON.stringify(enTree, null, 2);
}

for (const loc of LOC) {
  const fileName = loc + '.json';
  let raw = null;
  try {
    raw = read(fileName);
  } catch (e) {
    console.log('NO FILE', fileName, e.message);
    continue;
  }

  let fixedRaw = raw;

  if (loc === 'es' && !validate(raw)) {
    let salvaged = null;
    const key = '"scheduleSend"';
    let idx = raw.indexOf(key);
    while (idx !== -1) {
      let close = [0];
      if (findSpan(raw, idx, close)) {
        const block = raw.slice(idx, close[0] + 1);
        try {
          JSON.parse(block);
          salvaged = block;
          break;
        } catch (e) {}
      }
      idx = raw.indexOf(key, idx + 1);
    }
    if (salvaged) {
      const output = buildLocale(loc, '{}');
      const enSchedule = JSON.stringify(EN_LEAVES['Broadcasts.wizard.scheduleSend'] !== undefined);
      console.log(loc, 'salvaged scheduleSend ICU block from corrupted es.json');
      const outObj = JSON.parse(output);
      let saved = null;
      try {
        const parsedSav = JSON.parse(salvaged);
        outObj.Broadcasts.wizard.scheduleSend = parsedSav;
      } catch (e) {
        saved = 'sav-fail';
      }
      fixedRaw = JSON.stringify(outObj, null, 2);
    } else {
      fixedRaw = buildLocale(loc, raw);
    }
  } else {
    fixedRaw = buildLocale(loc, raw);
  }

  const ok = validate(fixedRaw);
  console.log(loc, 'merged valid:', ok);
  if (ok) {
    fs.writeFileSync(path.join(M, fileName), fixedRaw, 'utf8');
    console.log('  wrote', fileName, 'chars', fixedRaw.length);
  }
}

console.log('done');
