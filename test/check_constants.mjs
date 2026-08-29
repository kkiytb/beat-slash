import { readFileSync, readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url)) + '/../js';
const modDir = root + '/modules';

// collect exported constant names from constants.js (hardcoded stable list)
const constNames = new Set([
  'COL_X', 'LAYER_Y', 'HIT_Z', 'BASE_SPEED', 'NOTE_SIZE', 'WIN_GOOD', 'WIN_PERFECT',
  'MOUSE_WIN', 'SLASH_MIN', 'LEAD_DIST', 'DESPAWN_Z', 'HAND_RED', 'HAND_BLUE',
  'DIR_UP', 'DIR_DOWN', 'DIR_LEFT', 'DIR_RIGHT', 'DIR_ANGLE', 'DIR_DOT', 'CUT_ANGLE',
  'COL', 'SNAP4', 'SWING_ANGLES', 'LEFT_PIVOT', 'IDLE_ANGLE', 'AUTO_REST',
  'TIER_BASE', 'TIER_TEXT', 'TIER_COLOR', 'KEYMAP'
]);

function walk(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (f.endsWith('.js')) out.push(p);
  }
  return out;
}

const files = walk(modDir).concat([root + '/game_new.js']);
let problems = 0;
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  // names imported from constants.js
  const imported = new Set();
  for (const m of src.matchAll(/from '[^']*constants\.js'\)/g)) { /* noop */ }
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'[^']*constants\.js'/g)) {
    for (const n of m[1].split(',')) imported.add(n.trim().split(/\s+as\s+/)[0].trim());
  }
  // local declared names (const/let/function)
  const local = new Set();
  for (const m of src.matchAll(/(?:const|let|var|function|class)\s+([A-Za-z0-9_]+)/g)) local.add(m[1]);
  for (const name of constNames) {
    const re = new RegExp('\\b' + name + '\\b', 'g');
    if (re.test(src) && !imported.has(name) && !local.has(name)) {
      console.log(`MISSING IMPORT in ${file.replace(root, '')}: ${name}`);
      problems++;
    }
  }
}
console.log(problems ? `\n${problems} missing constant import(s)` : '\nAll constant usages are imported.');
