const STORE_KEY = 'bslash_lang';

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
const SUPPORTED = ['zh-CN', 'en'];
const DEFAULT_LANG = 'zh-CN';

const catalogs = {};
let current = DEFAULT_LANG;
let listeners = new Set();

export async function loadCatalog(lang) {
  if (catalogs[lang]) return catalogs[lang];
  try {
    const fetchFn = (typeof fetch !== 'undefined') ? fetch : null;
    if (!fetchFn) throw new Error('no-fetch');
    const res = await fetchFn(`locales/${lang}.json`);
    if (!res.ok) throw new Error('failed');
    catalogs[lang] = await res.json();
    return catalogs[lang];
  } catch (e) {
    console.warn('[i18n] load failed', lang, e && e.message);
    if (lang !== DEFAULT_LANG) return loadCatalog(DEFAULT_LANG);
    catalogs[lang] = {};
    return catalogs[lang];
  }
}

export async function setLang(lang) {
  if (!SUPPORTED.includes(lang)) lang = DEFAULT_LANG;
  await loadCatalog(lang);
  current = lang;
  try { safeSet(STORE_KEY, lang); } catch {}
  document.documentElement.lang = lang;
  for (const fn of listeners) {
    try { fn(lang); } catch (e) { console.warn('[i18n]', e); }
  }
}

export function getLang() { return current; }

export function getSupported() { return SUPPORTED.slice(); }

export function t(key, vars) {
  const cat = catalogs[current] || {};
  let str = cat[key];
  if (str === undefined) {
    const fb = catalogs[DEFAULT_LANG] || {};
    str = fb[key];
  }
  if (str === undefined) return key;
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined || vars[k] === null) ? '' : String(vars[k]));
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function initI18n() {
  let saved = null;
  try { saved = safeGet(STORE_KEY); } catch {}
  const nav = (navigator.language || '').toLowerCase();
  let lang = DEFAULT_LANG;
  if (saved && SUPPORTED.includes(saved)) lang = saved;
  else if (nav.startsWith('en')) lang = 'en';
  await setLang(lang);
  try { window.BS_i18n = { t, getLang, setLang, getSupported }; } catch {}
  return lang;
}