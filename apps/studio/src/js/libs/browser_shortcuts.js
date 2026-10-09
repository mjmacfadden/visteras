/**
 * Browser-safe shortcut remapping for digits and reserved letters.
 * Canonical input spec: { meta: true, key: 'L' } means "Photoshop's ⌘L / Ctrl+L".
 *
 * For digits:
 * Mac: add Ctrl to Cmd+digit (1–9). Windows: Ctrl+digit → Ctrl+Alt+digit;
 * already-Alt chords → Ctrl+Alt+Shift+digit.
 * Exception: digit 0 stays Illustrator (⌘0 / Ctrl+0) — zoom reset is preventDefault-able.
 *
 * For reserved letters (T, N, W, L, U, M):
 * Mac: add Ctrl to Cmd+letter (e.g. ⌃⌘L).
 * Windows: Ctrl+letter → Ctrl+Alt+letter; already-Alt chords → Ctrl+Alt+Shift+letter.
 * Non-reserved letters (e.g. E, J, R) return unchanged.
 */

export const RESERVED_LETTERS = new Set(['T', 'N', 'W', 'L', 'U', 'M']);

export function isDigitKey(key) {
  return /^[0-9]$/.test(String(key ?? '').trim());
}

export function browserSafeChord(spec = {}, isMac) {
  const mac = !!isMac;
  const key = String(spec.key ?? '').trim();
  let meta = !!spec.meta, ctrl = !!spec.ctrl, alt = !!spec.alt, shift = !!spec.shift;

  if (isDigitKey(key)) {
    if (key === '0') {
      if (mac) return { meta, ctrl, alt, shift, key };
      return { meta: false, ctrl: !!(meta || ctrl), alt, shift, key };
    }
    if (mac) {
      if (meta) ctrl = true;
      return { meta, ctrl, alt, shift, key };
    }
    const primary = meta || ctrl;
    if (!primary) return { meta: false, ctrl: false, alt, shift, key };
    if (alt) return { meta: false, ctrl: true, alt: true, shift: true, key };
    return { meta: false, ctrl: true, alt: true, shift: !!shift, key };
  }

  const upperKey = key.toUpperCase();
  if (RESERVED_LETTERS.has(upperKey)) {
    const primary = meta || ctrl;
    if (mac) {
      if (primary) {
        meta = true;
        ctrl = true;
      }
      return { meta, ctrl, alt, shift, key: upperKey };
    }
    if (!primary) return { meta: false, ctrl: false, alt, shift, key: upperKey };
    if (alt) return { meta: false, ctrl: true, alt: true, shift: true, key: upperKey };
    return { meta: false, ctrl: true, alt: true, shift: !!shift, key: upperKey };
  }

  return { meta, ctrl, alt, shift, key };
}

export function eventMatchesChord(e, spec, isMac) {
  const want = browserSafeChord(spec, isMac);
  const key = want.key;
  let keyOk = false;
  if (isDigitKey(key)) {
    keyOk = e.key === key || e.code === `Digit${key}` || e.code === `Numpad${key}`;
  } else if (/^[a-zA-Z]$/.test(key)) {
    keyOk = e.code === `Key${key.toUpperCase()}` || (e.key && e.key.toUpperCase() === key.toUpperCase());
  } else {
    keyOk = e.key === key || e.code === key;
  }
  if (!keyOk) return false;
  if (isMac) {
    if (!!want.meta !== !!e.metaKey) return false;
    if (!!want.ctrl !== !!e.ctrlKey) return false;
  } else {
    if (!!want.ctrl !== !!e.ctrlKey) return false;
    if (e.metaKey) return false;
  }
  if (!!want.alt !== !!e.altKey) return false;
  if (!!want.shift !== !!e.shiftKey) return false;
  return true;
}

export function eventMatchesDigitChord(e, illustratorSpec, isMac) {
  return eventMatchesChord(e, illustratorSpec, isMac);
}

export function formatStudioShortcut(spec, isMac) {
  const c = browserSafeChord(spec, isMac);
  if (isMac) {
    let out = '';
    if (c.ctrl) out += '⌃';
    if (c.alt) out += '⌥';
    if (c.shift) out += '⇧';
    if (c.meta) out += '⌘';
    return out + c.key;
  }
  const parts = [];
  if (c.ctrl) parts.push('Ctrl');
  if (c.alt) parts.push('Alt');
  if (c.shift) parts.push('Shift');
  parts.push(c.key);
  return parts.join('+');
}

export function formatStudioDigitShortcut(illustratorSpec, isMac) {
  return formatStudioShortcut(illustratorSpec, isMac);
}
