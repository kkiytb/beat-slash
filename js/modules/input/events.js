export function dispatchEvent(name) {
  document.dispatchEvent(new CustomEvent(name));
}

export function dispatchError(err, tag) {
  const msg = `[${tag}] ${err && err.stack ? err.stack : String(err)}`;
  console.error('[BeatSlash]', msg);
  try { document.dispatchEvent(new CustomEvent('bs-error', { detail: msg })); } catch (e) { console.warn('[BeatSlash]', e); }
}