/**
 * Visteras Vector — per-object blending mode (Illustrator Transparency panel).
 *
 * Rendering: CSS mix-blend-mode on the element (works for shapes, text, images and
 * groups). Persistence: SVG-Edit's sanitizer drops the `style` attribute when a
 * .vvd/.svg is opened, so the mode is also stored in data-visteras-blend and the
 * inline style is restored from it after load. Exported SVG carries the style.
 * Undo: one BatchCommand per change recording style + data-visteras-blend.
 */
export const BLEND_ATTR = 'data-visteras-blend';

/** Illustrator's list and order (groups separated in the UI). */
export const BLEND_MODES = [
  { value: 'normal', label: 'Normal', group: 0 },
  { value: 'darken', label: 'Darken', group: 1 },
  { value: 'multiply', label: 'Multiply', group: 1 },
  { value: 'color-burn', label: 'Color Burn', group: 1 },
  { value: 'lighten', label: 'Lighten', group: 2 },
  { value: 'screen', label: 'Screen', group: 2 },
  { value: 'color-dodge', label: 'Color Dodge', group: 2 },
  { value: 'overlay', label: 'Overlay', group: 3 },
  { value: 'soft-light', label: 'Soft Light', group: 3 },
  { value: 'hard-light', label: 'Hard Light', group: 3 },
  { value: 'difference', label: 'Difference', group: 4 },
  { value: 'exclusion', label: 'Exclusion', group: 4 },
  { value: 'hue', label: 'Hue', group: 5 },
  { value: 'saturation', label: 'Saturation', group: 5 },
  { value: 'color', label: 'Color', group: 5 },
  { value: 'luminosity', label: 'Luminosity', group: 5 },
];
const VALID = new Set(BLEND_MODES.map((m) => m.value));

export function normalizeBlendMode(value) {
  const v = String(value ?? '').trim().toLowerCase();
  return VALID.has(v) ? v : 'normal';
}

/** Read a property from an inline style string. */
export function styleProp(style, prop) {
  for (const part of String(style || '').split(';')) {
    const i = part.indexOf(':');
    if (i > 0 && part.slice(0, i).trim().toLowerCase() === prop) return part.slice(i + 1).trim();
  }
  return null;
}

/** Return a style string with `prop` set (or removed when value is null). Empty → null. */
export function setStyleProp(style, prop, value) {
  const parts = String(style || '').split(';').map((p) => p.trim()).filter(Boolean)
    .filter((p) => p.slice(0, p.indexOf(':')).trim().toLowerCase() !== prop);
  if (value != null && value !== '') parts.push(`${prop}: ${value}`);
  return parts.length ? `${parts.join('; ')};` : null;
}

/** The object's blend mode: stored attribute first, then inline style, else normal. */
export function readBlendMode(el) {
  if (!el?.getAttribute) return 'normal';
  const stored = el.getAttribute(BLEND_ATTR);
  if (stored) return normalizeBlendMode(stored);
  return normalizeBlendMode(styleProp(el.getAttribute('style'), 'mix-blend-mode'));
}

/** Mode shown for a selection: the common value, or '' when mixed / empty. */
export function selectionBlendMode(elements) {
  const modes = new Set((elements || []).filter(Boolean).map(readBlendMode));
  return modes.size === 1 ? [...modes][0] : '';
}

const setOrRemove = (el, name, value) => {
  if (value == null) el.removeAttribute(name);
  else el.setAttribute(name, value);
};

/** Write mode onto one element (style + stored attribute). Returns previous attrs or null if unchanged. */
export function writeBlendMode(el, mode) {
  const next = normalizeBlendMode(mode);
  const before = { style: el.getAttribute('style'), [BLEND_ATTR]: el.getAttribute(BLEND_ATTR) };
  const style = setStyleProp(before.style, 'mix-blend-mode', next === 'normal' ? null : next);
  const stored = next === 'normal' ? null : next;
  if (style === before.style && stored === before[BLEND_ATTR]) return null;
  setOrRemove(el, 'style', style);
  setOrRemove(el, BLEND_ATTR, stored);
  return before;
}

/**
 * Apply a blend mode to every element (groups get it on the group itself, like
 * Illustrator's Transparency panel). One undo step.
 */
export function applyBlendMode(sc, elements, mode) {
  const list = (elements || []).filter((el) => el?.getAttribute);
  const { BatchCommand, ChangeElementCommand } = sc?.history || {};
  const batch = BatchCommand ? new BatchCommand(`Blending mode: ${normalizeBlendMode(mode)}`) : null;
  const changed = [];
  for (const el of list) {
    const before = writeBlendMode(el, mode);
    if (!before) continue;
    // ChangeElementCommand reads the new values at construction → build it after the write.
    if (batch && ChangeElementCommand) batch.addSubCommand(new ChangeElementCommand(el, before));
    changed.push(el);
  }
  if (batch && changed.length) sc.addCommandToHistory?.(batch);
  if (changed.length) sc.call?.('changed', changed);
  return changed;
}

/**
 * After load/paste (sanitizer stripped style) restore the inline style from the
 * stored attribute; adopt inline modes that have no stored attribute (imported SVG).
 * Derived state only: no history.
 */
export function syncBlendStyle(el) {
  if (!el?.getAttribute) return false;
  const stored = el.getAttribute(BLEND_ATTR);
  const inline = styleProp(el.getAttribute('style'), 'mix-blend-mode');
  if (stored) {
    const mode = normalizeBlendMode(stored);
    if (mode === 'normal') { el.removeAttribute(BLEND_ATTR); return true; }
    if (inline !== mode) {
      setOrRemove(el, 'style', setStyleProp(el.getAttribute('style'), 'mix-blend-mode', mode));
      return true;
    }
    return false;
  }
  if (inline && normalizeBlendMode(inline) !== 'normal') {
    el.setAttribute(BLEND_ATTR, normalizeBlendMode(inline));
    return true;
  }
  return false;
}

export function blendOptionsHtml() {
  let html = '<option value="" hidden>Mixed</option>';
  let group = 0;
  for (const m of BLEND_MODES) {
    if (m.group !== group) { html += '<option disabled>──────────</option>'; group = m.group; }
    html += `<option value="${m.value}">${m.label}</option>`;
  }
  return html;
}

const selectable = (sc) => (sc.getSelectedElements?.() || []).filter((el) => el && el.getAttribute && !el.classList?.contains('layer'));

export function mountBlendModes(editor) {
  const sc = editor.svgCanvas;
  const slot = document.getElementById('slot_blend_mode');
  if (!slot) return null;
  slot.innerHTML = `<label class="visteras_blend_label" for="vector_blend_mode" title="Blending mode (Transparency)">Blending</label>
    <select id="vector_blend_mode" class="visteras_blend_select" aria-label="Blending mode">${blendOptionsHtml()}</select>`;
  const select = slot.querySelector('select');
  const row = document.getElementById('prop_row_blend');
  const sync = () => {
    const els = selectable(sc);
    if (row) row.style.display = els.length ? '' : 'none';
    if (document.activeElement !== select) select.value = selectionBlendMode(els);
  };
  select.addEventListener('change', () => {
    if (!select.value) return;
    applyBlendMode(sc, selectable(sc), select.value);
    sync();
  });
  // Restore inline styles after load / undo / paste.
  let queued = false;
  const rehydrate = () => {
    queued = false;
    for (const el of sc.getSvgContent?.()?.querySelectorAll(`[${BLEND_ATTR}], [style*="mix-blend-mode"]`) || []) syncBlendStyle(el);
  };
  const schedule = () => { if (!queued) { queued = true; queueMicrotask(rehydrate); } };
  // Observe the persistent root: setSvgString (Open) replaces #svgcontent itself.
  const root = sc.getSvgRoot?.() || sc.getSvgContent?.();
  if (root && typeof MutationObserver !== 'undefined') {
    new MutationObserver(schedule).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: [BLEND_ATTR, 'style'] });
  }
  const call = sc.call;
  sc.call = function (event, ...args) {
    const result = call.call(this, event, ...args);
    if (event === 'selected' || event === 'changed') { sync(); schedule(); }
    return result;
  };
  rehydrate();
  sync();
  return { sync, rehydrate };
}
