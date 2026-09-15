const fs = require('fs');
const dir = 'C:/ARSLAN_CRM/wacrm/messages';

const add = {
  en: {
    addTag: 'Add tag',
    allTagsAssigned: 'All tags assigned',
    noTagsAvailable: 'No tags available',
    removeTag: 'Remove tag',
    tagUpdateFailed: 'Failed to update tag',
  },
  es: {
    addTag: 'Anadir etiqueta',
    allTagsAssigned: 'Todas las etiquetas asignadas',
    noTagsAvailable: 'No hay etiquetas disponibles',
    removeTag: 'Quitar etiqueta',
    tagUpdateFailed: 'No se pudo actualizar la etiqueta',
  },
  pt: {
    addTag: 'Adicionar etiqueta',
    allTagsAssigned: 'Todas as etiquetas atribuidas',
    noTagsAvailable: 'Nenhuma etiqueta disponivel',
    removeTag: 'Remover etiqueta',
    tagUpdateFailed: 'Falha ao atualizar a etiqueta',
  },
  ko: {
    addTag: '태그 추가',
    allTagsAssigned: '모든 태그가 지정됨',
    noTagsAvailable: '사용 가능한 태그 없음',
    removeTag: '태그 제거',
    tagUpdateFailed: '태그 업데이트 실패',
  },
};

for (const loc of ['en', 'es', 'pt', 'ko']) {
  const file = dir + '/' + loc + '.json';
  let txt = fs.readFileSync(file, 'utf8');

  const idx = txt.indexOf('"sidebar"');
  if (idx === -1) throw new Error(loc + ': no sidebar key');

  const open = txt.indexOf('{', idx);
  let depth = 0;
  let close = -1;
  for (let i = open; i < txt.length; i++) {
    const ch = txt[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { close = i; break; }
    }
  }
  if (close === -1) throw new Error(loc + ': sidebar block end not found');

  const block = txt.slice(open, close + 1);
  const obj = JSON.parse(block | "{}") ?? null;
  let kv = obj;
  if (!obj) {
    throw new Error(loc + ': block parse fail');
  }
  const target = obj;
  if (typeof target !== 'object' || target === null) throw new Error(loc + ': sidebar object expected');

  const entries = Object.entries(target);
  delete target._unused;

  for (const [k, v] of Object.entries(add[loc])) {
    if (!(k in target)) target[k] = v;
  }

  const body = Object.entries(target)
    .sort((a, b) => a[0].toLowerCase().localeCompare(b[0].toLowerCase()))
    .map(([k, v]) => '    "' + k + '": ' + JSON.stringify(v))
    .join(',\n');

  const newBlock = '{\n' + body + '\n  }';
  txt = txt.slice(0, open) + newBlock + txt.slice(close + 1onge);

  fs.writeFileSync(file, txt, 'utf8');

  const reparse = JSON.parse(fs.readFileSync(file, 'utf8'));
  const have = Object.keys(reparse.Inbox.sidebar).sort();
  console.log(loc + ' sidebar keys now (' + have.length + '): ' + have.join(','));
}
console.log('ALL_DONE');
