/**
 * Apply formatShortcut across Vector UI labels so Mac gets ⌘ symbols and
 * Windows/Linux get Ctrl+/Alt+/Shift+ — never raw META/Meta.
 */
import { detectMac, localizeShortcut, hasForbiddenShortcutToken } from './visteras-shortcut-label.js';

const SELECTORS = [
  '.menu_dropdown_shortcut',
  '.vcm-shortcut',
  '[data-shortcut]',
  'se-button[title]',
];

export function rewriteShortcutLabels(root = document, { mac = detectMac() } = {}) {
  const nodes = [];
  for (const sel of SELECTORS) {
    try { nodes.push(...root.querySelectorAll(sel)); } catch { /* ignore */ }
  }
  let changed = 0;
  for (const el of nodes) {
    if (el.matches?.('.menu_dropdown_shortcut, .vcm-shortcut, [data-shortcut]')) {
      const raw = el.getAttribute('data-shortcut') || el.textContent || '';
      // Skip multi-alternative labels like "⌘R / Ctrl+R" — rewrite each side
      if (raw.includes('/')) {
        const parts = raw.split('/').map((p) => localizeShortcut(p.trim(), mac));
        const next = parts.join(' / ');
        if (next && next !== el.textContent) { el.textContent = next; changed++; }
        continue;
      }
      const next = localizeShortcut(raw, mac);
      if (next && next !== el.textContent) { el.textContent = next; changed++; }
      continue;
    }
    if (el.hasAttribute?.('title')) {
      const title = el.getAttribute('title') || '';
      if (hasForbiddenShortcutToken(title) || /\b(Ctrl|CMD|Cmd|META|Meta)\+/.test(title)) {
        // Replace META+/Ctrl+ chords inside titles conservatively
        const next = title.replace(/\b((?:META|Meta|Cmd|CMD|Ctrl|Control|Alt|Option|Shift)\+)+[A-Za-z0-9]+/g, (m) => localizeShortcut(m, mac));
        if (next !== title) { el.setAttribute('title', next); changed++; }
      }
    }
  }
  return changed;
}

export function mountShortcutLabels() {
  if (window.__visterasShortcutLabels) return window.__visterasShortcutLabels;
  const mac = detectMac();
  const run = () => rewriteShortcutLabels(document, { mac });
  run();
  // Legacy SVG-Edit cmenu embeds META+X in shadow DOM — blank those if still present
  const scrubLegacy = () => {
    const host = document.getElementById('se-cmenu_canvas');
    const root = host?.shadowRoot;
    if (!root) return;
    for (const s of root.querySelectorAll('.shortcut')) {
      const raw = s.textContent || '';
      if (hasForbiddenShortcutToken(raw) || /META|Meta|CTRL|SHFT|BACKSPACE/i.test(raw)) {
        s.textContent = localizeShortcut(raw.replace(/SHFT/gi, 'Shift').replace(/CTRL/gi, 'Ctrl'), mac);
      }
    }
  };
  scrubLegacy();
  setTimeout(scrubLegacy, 500);
  setTimeout(run, 500);
  const api = { rewriteShortcutLabels: run, scrubLegacy, mac };
  window.__visterasShortcutLabels = api;
  return api;
}
