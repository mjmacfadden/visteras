/**
 * Browser-safe shortcut remapping for Vector (and mirrored by Studio).
 *
 * Chrome/Safari reserve ⌘1–9 (and Ctrl+1–9 on Windows) for tab switching.
 * ⌘0 / Ctrl+0 resets page zoom, but unlike tab keys the page CAN block that
 * with preventDefault on keydown (capture if needed) — so Fit Artboard keeps
 * Illustrator’s ⌘0 / Ctrl+0 (and Fit All ⌥⌘0 / Ctrl+Alt+0). Digits 1–9 still remap.
 *
 * Rule (Rham / gravit-gap-3):
 *   Mac:     add ⌃ to ⌘+digit (1–9) → ⌃⌘N, ⌃⌥⌘N, …
 *   Windows: Ctrl+digit (1–9) → Ctrl+Alt+digit;
 *            already-Alt → Ctrl+Alt+Shift+digit
 *   Exception: digit 0 is left as Illustrator (⌘0 / ⌥⌘0; Win Ctrl+0 / Ctrl+Alt+0).
 *
 * AltGr note: Ctrl+Alt+letter is AltGr on many EU layouts; digit chords are
 * usually safer but still flagged in tests/docs.
 */

import { formatShortcut, detectMac } from './visteras-shortcut-label.js';

/** True if `key` is a digit 0–9 (Illustrator tab/zoom style bindings). */
export function isDigitKey(key) {
  return /^[0-9]$/.test(String(key ?? '').trim());
}

/**
 * Remap a chord so Meta/Ctrl+digit is not a bare browser tab/zoom shortcut.
 * @param {{ meta?: boolean, ctrl?: boolean, alt?: boolean, shift?: boolean, key: string, mac?: boolean }} spec
 */
export function browserSafeChord(spec = {}) {
  const mac = spec.mac != null ? !!spec.mac : detectMac();
  const key = String(spec.key ?? '').trim();
  let { meta = false, ctrl = false, alt = false, shift = false } = spec;
  if (!isDigitKey(key)) {
    return { meta: !!meta, ctrl: !!ctrl, alt: !!alt, shift: !!shift, key, mac };
  }
  // Digit 0: keep Illustrator chords. Chrome zoom-reset is preventDefault-able
  // (unlike ⌘1–9 tab switching). Handlers must call preventDefault on keydown.
  if (key === '0') {
    if (mac) {
      return { meta: !!meta, ctrl: !!ctrl, alt: !!alt, shift: !!shift, key, mac };
    }
    return { meta: false, ctrl: !!(meta || ctrl), alt: !!alt, shift: !!shift, key, mac };
  }
  if (mac) {
    if (meta) ctrl = true; // ⌃⌘digit…
    return { meta: !!meta, ctrl: !!ctrl, alt: !!alt, shift: !!shift, key, mac };
  }
  // Windows / Linux: treat meta as Ctrl
  const primary = !!(meta || ctrl);
  if (!primary) {
    return { meta: false, ctrl: false, alt: !!alt, shift: !!shift, key, mac };
  }
  if (alt) {
    // Already Alt+Ctrl+digit → add Shift so it stays distinct from remapped primary
    return { meta: false, ctrl: true, alt: true, shift: true, key, mac };
  }
  return { meta: false, ctrl: true, alt: true, shift: !!shift, key, mac };
}

/** formatShortcut after browserSafeChord. */
export function formatBrowserSafeShortcut(spec = {}) {
  const safe = browserSafeChord(spec);
  return formatShortcut(safe);
}

/**
 * Does this chord collide with a known unoverridable browser/OS shortcut?
 * (After remapping, digit+primary alone should return false.)
 */
export function isBrowserReservedChord(spec = {}) {
  const mac = spec.mac != null ? !!spec.mac : detectMac();
  const key = String(spec.key ?? '').trim().toLowerCase();
  const meta = !!spec.meta;
  const ctrl = !!spec.ctrl;
  const alt = !!spec.alt;
  const shift = !!spec.shift;
  const primary = mac ? meta : (ctrl || meta);

  // Tab switching: primary+digit 1–9 with no safety modifier is reserved.
  // Digit 0 is NOT reserved here: browsers reset zoom on ⌘0/Ctrl+0, but the
  // page can preventDefault that (verified in Chrome). Fit Artboard uses it.
  if (isDigitKey(key) && key !== '0' && primary) {
    if (mac && meta && !ctrl) return true; // bare ⌘digit
    if (!mac && (ctrl || meta) && !alt) return true; // bare Ctrl+digit
  }

  if (mac && meta && !ctrl && !alt) {
    // Common Mac browser/OS exclusives (letters)
    if (['n', 't', 'w', 'q', 'h', 'm', '`'].includes(key) && !shift) return true;
    if (shift && ['n', 't', 'w'].includes(key)) return true; // ⌘⇧N/T/W
  }
  if (!mac && (ctrl || meta) && !alt) {
    if (['n', 't', 'w'].includes(key) && !shift) return true;
    if (shift && ['n', 't', 'w'].includes(key)) return true;
  }
  return false;
}

/**
 * Match a keydown event against a (possibly remapped) chord.
 * Digit chords use browserSafeChord so handlers and labels stay in sync.
 */
export function eventMatchesChord(e, spec = {}) {
  const mac = spec.mac != null ? !!spec.mac : detectMac();
  const want = browserSafeChord({ ...spec, mac });
  const key = String(want.key);
  const codeDigit = isDigitKey(key) ? `Digit${key}` : null;
  const codeNumpad = isDigitKey(key) ? `Numpad${key}` : null;
  const keyOk =
    e.key === key ||
    e.key === key.toUpperCase() ||
    (codeDigit && e.code === codeDigit) ||
    (codeNumpad && e.code === codeNumpad);
  if (!keyOk) return false;

  if (mac) {
    if (!!want.meta !== !!e.metaKey) return false;
    if (!!want.ctrl !== !!e.ctrlKey) return false;
  } else {
    // Windows: require Ctrl; ignore meta
    if (want.ctrl && !e.ctrlKey) return false;
    if (!want.ctrl && e.ctrlKey) return false;
  }
  if (!!want.alt !== !!e.altKey) return false;
  if (!!want.shift !== !!e.shiftKey) return false;
  return true;
}

/**
 * Canonical Vector remaps (Illustrator → browser-safe). Pure data for tests.
 */
export const VECTOR_DIGIT_ACTIONS = Object.freeze([
  { id: 'fit_artboard', illustrator: { meta: true, key: '0' }, label: 'Fit Artboard in Window' },
  { id: 'fit_all', illustrator: { meta: true, alt: true, key: '0' }, label: 'Fit All Artboards' },
  { id: 'zoom_100', illustrator: { meta: true, key: '1' }, label: 'Actual Size' },
  { id: 'lock', illustrator: { meta: true, key: '2' }, label: 'Lock Selection' },
  { id: 'unlock_all', illustrator: { meta: true, alt: true, key: '2' }, label: 'Unlock All' },
  { id: 'hide', illustrator: { meta: true, key: '3' }, label: 'Hide Selection' },
  { id: 'show_all', illustrator: { meta: true, alt: true, key: '3' }, label: 'Show All' },
  { id: 'clip_make', illustrator: { meta: true, key: '7' }, label: 'Make Clipping Mask' },
  { id: 'clip_release', illustrator: { meta: true, alt: true, key: '7' }, label: 'Release Clipping Mask' },
  { id: 'compound_make', illustrator: { meta: true, key: '8' }, label: 'Make Compound Path' },
  { id: 'compound_release', illustrator: { meta: true, alt: true, shift: true, key: '8' }, label: 'Release Compound Path' },
]);

export function mappedChord(illustratorSpec, mac) {
  return browserSafeChord({ ...illustratorSpec, mac });
}

export function mappedLabel(illustratorSpec, mac) {
  return formatBrowserSafeShortcut({ ...illustratorSpec, mac });
}
