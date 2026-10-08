/**
 * Illustrator-style shortcut labels.
 * Mac: symbols in order ⌃ ⌥ ⇧ ⌘ then key (e.g. ⌘X, ⇧⌘G, ⌥⌘2, ⇧F6).
 * Windows/Linux: Ctrl+/Alt+/Shift+ then key (e.g. Ctrl+X, Shift+Ctrl+G, Alt+Ctrl+2).
 */

export function detectMac(platform = (typeof navigator !== 'undefined' ? navigator.platform || navigator.userAgentData?.platform || '' : '')) {
  return /mac|iphone|ipad|ipod/i.test(String(platform));
}

/**
 * @param {{ key: string, meta?: boolean, ctrl?: boolean, alt?: boolean, shift?: boolean, mac?: boolean }} spec
 * @returns {string}
 */
export function formatShortcut(spec = {}) {
  const keyRaw = String(spec.key ?? '').trim();
  if (!keyRaw) return '';
  const mac = spec.mac != null ? !!spec.mac : detectMac();
  // Normalize key display
  let key = keyRaw;
  const lower = keyRaw.toLowerCase();
  const keyMapMac = {
    backspace: '⌫', delete: '⌫', enter: '↩', return: '↩', escape: '⎋', esc: '⎋',
    arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→',
    tab: '⇥', space: '␣',
  };
  const keyMapWin = {
    backspace: 'Backspace', delete: 'Delete', enter: 'Enter', return: 'Enter',
    escape: 'Esc', esc: 'Esc',
    arrowup: 'Up', arrowdown: 'Down', arrowleft: 'Left', arrowright: 'Right',
    tab: 'Tab', space: 'Space',
  };
  if (mac && keyMapMac[lower]) key = keyMapMac[lower];
  else if (!mac && keyMapWin[lower]) key = keyMapWin[lower];
  else if (/^f\d{1,2}$/i.test(keyRaw)) key = keyRaw.toUpperCase();
  else if (keyRaw.length === 1) key = keyRaw.toUpperCase();

  const meta = !!spec.meta;
  const ctrl = !!spec.ctrl;
  const alt = !!spec.alt;
  const shift = !!spec.shift;

  if (mac) {
    // Illustrator order: Ctrl, Option, Shift, Command, then key
    let out = '';
    if (ctrl) out += '⌃';
    if (alt) out += '⌥';
    if (shift) out += '⇧';
    if (meta) out += '⌘';
    return out + key;
  }
  // Windows/Linux Illustrator-style: Shift+Ctrl+G, Alt+Ctrl+2 (modifiers before Ctrl).
  const parts = [];
  if (shift) parts.push('Shift');
  if (alt) parts.push('Alt');
  if (ctrl || meta) parts.push('Ctrl'); // treat meta as Ctrl on non-Mac
  parts.push(key);
  return parts.join('+');
}

/** Parse a loose chord like "Meta+Shift+G", "⌘⇧G", "Ctrl+Alt+2" into a spec. */
export function parseShortcutChord(chord) {
  const s = String(chord || '').trim();
  if (!s) return null;
  // Already symbolic Mac form without separators
  if (/^[⌃⌥⇧⌘]+/.test(s) && !/\+/.test(s)) {
    return {
      ctrl: s.includes('⌃'),
      alt: s.includes('⌥'),
      shift: s.includes('⇧'),
      meta: s.includes('⌘'),
      key: s.replace(/[⌃⌥⇧⌘]/g, ''),
    };
  }
  const parts = s.split('+').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1).map((p) => p.toLowerCase());
  return {
    meta: mods.some((m) => m === 'meta' || m === 'cmd' || m === 'command' || m === '⌘'),
    ctrl: mods.some((m) => m === 'ctrl' || m === 'control' || m === '⌃'),
    alt: mods.some((m) => m === 'alt' || m === 'option' || m === 'opt' || m === '⌥'),
    shift: mods.some((m) => m === 'shift' || m === '⇧'),
    key,
  };
}

/** Reformat any chord string for the current (or given) platform. */
export function localizeShortcut(chord, mac) {
  const spec = parseShortcutChord(chord);
  if (!spec) return String(chord || '');
  return formatShortcut({ ...spec, mac });
}

const FORBIDDEN = /\bMETA\b|\bMeta\b|META\+/;

/** True if a visible shortcut label still uses raw META / Meta. */
export function hasForbiddenShortcutToken(label) {
  return FORBIDDEN.test(String(label || ''));
}
