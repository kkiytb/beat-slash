import { t, onChange } from './i18n.js';

function applyToElement(el) {
  const k = el.getAttribute('data-i18n');
  if (k && el.children.length === 0) {
    el.textContent = t(k);
  }
  const titleK = el.getAttribute('data-i18n-title');
  if (titleK) {
    el.setAttribute('title', t(titleK));
  }
}

export function applyI18nToDOM(root) {
  (root || document).querySelectorAll('[data-i18n],[data-i18n-title]').forEach(applyToElement);
  const pageTitle = t('app.title');
  if (pageTitle) document.title = pageTitle;
}

onChange(() => applyI18nToDOM(document));