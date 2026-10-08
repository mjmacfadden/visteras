/**
 * Browser-safe digit shortcut remapping (same rule as Vector gravit-gap-3).
 * Mac: add Ctrl to Cmd+digit. Windows: Ctrl+digit → Ctrl+Alt+digit;
 * already-Alt chords → Ctrl+Alt+Shift+digit.
 */
export function isDigitKey(key) {
  return /^[0-9]$/.test(String(key ?? '').trim());
}

export function browserSafeChord(spec = {}, isMac) {
  const mac = !!isMac;
  const key = String(spec.key ?? '').trim();
  let meta = !!spec.meta, ctrl = !!spec.ctrl, alt = !!spec.alt, shift = !!spec.shift;
  if (!isDigitKey(key)) return { meta, ctrl, alt, shift, key };
  if (mac) {
    if (meta) ctrl = true;
    return { meta, ctrl, alt, shift, key };
  }
  const primary = meta || ctrl;
  if (!primary) return { meta: false, ctrl: false, alt, shift, key };
  if (alt) return { meta: false, ctrl: true, alt: true, shift: true, key };
  return { meta: false, ctrl: true, alt: true, shift: !!shift, key };
}

export function eventMatchesDigitChord(e, illustratorSpec, isMac) {
  const want = browserSafeChord(illustratorSpec, isMac);
  const key = want.key;
  const keyOk = e.key === key || e.code === `Digit${key}` || e.code === `Numpad${key}`;
  if (!keyOk) return false;
  if (isMac) {
    if (!!want.meta !== !!e.metaKey) return false;
    if (!!want.ctrl !== !!e.ctrlKey) return false;
  } else {
    if (!!want.ctrl !== !!e.ctrlKey) return false;
  }
  if (!!want.alt !== !!e.altKey) return false;
  if (!!want.shift !== !!e.shiftKey) return false;
  return true;
}

export function formatStudioDigitShortcut(illustratorSpec, isMac) {
  const c = browserSafeChord(illustratorSpec, isMac);
  if (isMac) {
    let out = '';
    if (c.ctrl) out += '⌃';
    if (c.alt) out += '⌥';
    if (c.shift) out += '⇧';
    if (c.meta) out += '⌘';
    return out + c.key;
  }
  const parts = [];
  if (c.shift) parts.push('Shift');
  if (c.alt) parts.push('Alt');
  if (c.ctrl) parts.push('Ctrl');
  parts.push(c.key);
  return parts.join('+');
}
