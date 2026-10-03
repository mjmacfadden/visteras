/**
 * Visteras Vector — one-time cleanup of SVG-Edit ext-storage leftovers.
 *
 * Vector used to force SVG-Edit's ext-storage on (cookie
 * `svgeditstore=prefsAndContent` + `forceStorage`), which wrote the whole
 * drawing to localStorage on every unload ('svgedit-<canvasName>' plus
 * 'title-svgedit-<canvasName>') and SVG-Edit prefs as 'svg-edit-<pref>'.
 * Documents are now saved only as .vvd/.svg files, so on load we expire
 * the cookie and remove those keys. Idempotent: once they are gone this
 * finds nothing to do.
 *
 * Deliberately NOT touched: 'svgedit_clipboard' / 'svgedit_clipboard_startup'
 * (underscore; live cross-tab clipboard) and every 'visteras_*' preference.
 */

export const LEGACY_COOKIE = 'svgeditstore';
export const LEGACY_KEY_PREFIXES = Object.freeze(['svgedit-', 'title-svgedit-', 'svg-edit-']);

export function isLegacySvgEditKey(key) {
  return typeof key === 'string' && LEGACY_KEY_PREFIXES.some((p) => key.startsWith(p));
}

function cookiePaths(loc) {
  const paths = ['/'];
  const pathname = loc?.pathname || '';
  const dir = pathname.replace(/[^/]*$/, '');
  if (dir && dir !== '/') {
    paths.push(dir);
    if (dir.endsWith('/')) paths.push(dir.slice(0, -1));
  }
  return paths;
}

/**
 * @param {{ storage?: Storage|null, doc?: Document|null, loc?: Location|null }} [env]
 * @returns {{ removedKeys: string[], cookieCleared: boolean }}
 */
export function clearLegacySvgEditStorage({
  storage = (typeof localStorage !== 'undefined' ? localStorage : null),
  doc = (typeof document !== 'undefined' ? document : null),
  loc = (typeof location !== 'undefined' ? location : null),
} = {}) {
  const removedKeys = [];
  if (storage) {
    try {
      const keys = [];
      for (let i = 0; i < storage.length; i++) keys.push(storage.key(i));
      for (const key of keys) {
        if (!isLegacySvgEditKey(key)) continue;
        storage.removeItem(key);
        removedKeys.push(key);
      }
    } catch { /* storage unavailable (privacy mode) — nothing to clean */ }
  }

  let cookieCleared = false;
  if (doc) {
    try {
      const re = new RegExp(`(?:^|;\\s*)${LEGACY_COOKIE}=`);
      if (re.test(doc.cookie || '')) {
        // The cookie was written with path=/ by index.html, and without a path
        // (defaults to the page directory) by ext-storage — expire both.
        for (const p of cookiePaths(loc)) {
          doc.cookie = `${LEGACY_COOKIE}=; path=${p}; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        }
        doc.cookie = `${LEGACY_COOKIE}=; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        cookieCleared = true;
      }
    } catch { /* cookies blocked */ }
  }
  return { removedKeys, cookieCleared };
}
