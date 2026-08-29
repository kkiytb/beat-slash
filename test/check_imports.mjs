import { readFileSync, readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url)) + '/../js';
const modDir = root + '/modules';

function walk(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (f.endsWith('.js')) out.push(p);
  }
  return out;
}
const files = walk(modDir).concat([root + '/game_new.js', root + '/main.js']);

// strip comments
function strip(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

// 1) gather all exported names across modules
const allExported = new Map(); // name -> [files]
for (const file of files) {
  const src = strip(readFileSync(file, 'utf8'));
  for (const m of src.matchAll(/(?:export\s+(?:async\s+)?function\s+|export\s+class\s+|export\s+const\s+|export\s+let\s+)([A-Za-z0-9_$]+)/g)) {
    const n = m[1];
    if (!allExported.has(n)) allExported.set(n, []);
    allExported.get(n).push(file);
  }
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const n of m[1].split(',')) {
      const name = n.trim().split(/\s+as\s+/)[0].trim();
      if (!name) continue;
      if (!allExported.has(name)) allExported.set(name, []);
      allExported.get(name).push(file);
    }
  }
}

// JS builtins / globals to ignore
const builtins = new Set(['window','document','self','THREE','Math','console','performance','localStorage',
  'requestAnimationFrame','cancelAnimationFrame','AudioContext','CustomEvent','Date','JSON','Object','Array',
  'Uint8Array','Uint16Array','Uint32Array','Float32Array','Int8Array','Number','String','Boolean','Set','Map',
  'setTimeout','clearTimeout','setInterval','clearInterval','parseInt','parseFloat','isNaN','Promise','Error',
  'Symbol','RegExp','Function','globalThis','module','exports','require','navigator','Image','Blob','URL',
  'XMLHttpRequest','fetch','alert','undefined','null','true','false','this','new','return','if','else','for',
  'while','switch','case','break','continue','typeof','in','of','void','await','async','yield','class','extends',
  'import','export','default','const','let','var','function','throw','try','catch','finally','do','delete','instanceof']);

const idRe = /(?:^|[^.\w$])([A-Za-z_$][A-Za-z0-9_$]*)/g;

let problems = 0;
for (const file of files) {
  const raw = readFileSync(file, 'utf8');
  const src = strip(raw);
  // imports per file: name -> true
  const imported = new Set();
  for (const m of src.matchAll(/import\s+(?:[A-Za-z_$][\w$]*\s*,?\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    for (const n of m[1].split(',')) imported.add(n.trim().split(/\s+as\s+/)[0].trim());
  }
  for (const m of src.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from/g)) imported.add(m[1]);
  // local declarations
  const local = new Set();
  for (const m of src.matchAll(/(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g)) local.add(m[1]);
  for (const m of src.matchAll(/(?:export\s+)?(?:const|let|var|class)\s+([A-Za-z0-9_$]+)/g)) local.add(m[1]);
  // exported too
  for (const m of src.matchAll(/(?:export\s+(?:async\s+)?function\s+|export\s+class\s+|export\s+const\s+|export\s+let\s+)([A-Za-z0-9_$]+)/g)) local.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) for (const n of m[1].split(',')) local.add(n.trim().split(/\s+as\s+/)[0].trim());

  const seen = new Set();
  let m;
  while ((m = idRe.exec(src))) {
    const name = m[1];
    if (seen.has(name)) continue;
    seen.add(name);
    if (builtins.has(name)) continue;
    if (imported.has(name) || local.has(name)) continue;
    if (allExported.has(name)) {
      // used but defined elsewhere and not imported -> likely missing import
      const defs = allExported.get(name).filter(f => f !== file);
      if (defs.length) {
        console.log(`MISSING IMPORT? ${file.replace(root,'')}: ${name}  (defined in ${defs.map(d=>d.replace(root,'')).join(', ')})`);
        problems++;
      }
    }
  }
}
console.log(problems ? `\n${problems} potential missing import(s)` : '\nNo missing imports detected.');
