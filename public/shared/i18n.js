/**
 * NEXT SHOW · i18n
 * Carga el diccionario JSON de /i18n/<lang>.json y expone t(key, vars).
 * Si la key no existe devuelve la key (fallback util para debug).
 */

let dict = {};
let currentLang = 'es';

export async function loadI18n(lang = 'es') {
  try {
    const r = await fetch(`/i18n/${lang}.json`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    dict = await r.json();
    currentLang = lang;
    document.documentElement.setAttribute('lang', lang);
  } catch (err) {
    console.warn(`[i18n] no se pudo cargar ${lang}.json:`, err.message);
    dict = {};
  }
}

export function t(key, vars = {}) {
  let s = dict[key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

export function getLang() {
  return currentLang;
}
