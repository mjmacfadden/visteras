/**
 * Visteras Vector — Window ▸ Transparency panel (⇧⌘F10), Illustrator layout:
 *   [Blend Mode ▾]  Opacity: [100] %  (slider)
 *   ☐ Isolate Blending   (groups: CSS isolation:isolate)
 * Acts on the selection; one undo step per change. The Properties ▸ Appearance
 * opacity spinner and Blending dropdown stay as mirrors (they sync through
 * svgCanvas 'changed'/'selected').
 * Isolation persists in data-visteras-isolate (the SVG-Edit sanitizer drops
 * `style` on Open) and the inline style is restored from it, like blend modes.
 */
import { BLEND_ATTR, blendOptionsHtml, selectionBlendMode, applyBlendMode, styleProp, setStyleProp } from './visteras-blend-modes.js?v=gravit-1';

export const ISOLATE_ATTR = 'data-visteras-isolate';

/** Opacity of one element in percent (attribute `opacity`, default 100). */
export function readOpacityPercent(el) {
  const v = Number.parseFloat(el?.getAttribute?.('opacity'));
  return Number.isFinite(v) ? Math.round(Math.min(1, Math.max(0, v)) * 1000) / 10 : 100;
}

/** Common opacity of a selection (rounded %), or '' when mixed / empty. */
export function selectionOpacity(elements) {
  const vals = new Set((elements || []).filter(Boolean).map((el) => Math.round(readOpacityPercent(el))));
  return vals.size === 1 ? [...vals][0] : '';
}

export const clampOpacity = (v) => Math.min(100, Math.max(0, Math.round(Number(v))));

export const readIsolate = (el) => el?.getAttribute?.(ISOLATE_ATTR) === '1' || styleProp(el?.getAttribute?.('style'), 'isolation') === 'isolate';

/** Write isolation onto a group (style + stored attr). Returns previous attrs or null. */
export function writeIsolate(el, on) {
  const before = { style: el.getAttribute('style'), [ISOLATE_ATTR]: el.getAttribute(ISOLATE_ATTR) };
  const style = setStyleProp(before.style, 'isolation', on ? 'isolate' : null);
  const stored = on ? '1' : null;
  if (style === before.style && stored === before[ISOLATE_ATTR]) return null;
  if (style == null) el.removeAttribute('style'); else el.setAttribute('style', style);
  if (stored == null) el.removeAttribute(ISOLATE_ATTR); else el.setAttribute(ISOLATE_ATTR, stored);
  return before;
}

/** Restore the inline isolation style after load/paste (derived state, no history). */
export function syncIsolateStyle(el) {
  const stored = el.getAttribute(ISOLATE_ATTR) === '1';
  const inline = styleProp(el.getAttribute('style'), 'isolation') === 'isolate';
  if (stored && !inline) { el.setAttribute('style', setStyleProp(el.getAttribute('style'), 'isolation', 'isolate')); return true; }
  if (!stored && inline) { el.setAttribute(ISOLATE_ATTR, '1'); return true; }
  return false;
}

function batchWrite(sc, elements, write, label) {
  const { BatchCommand, ChangeElementCommand } = sc?.history || {};
  const batch = BatchCommand ? new BatchCommand(label) : null;
  const changed = [];
  for (const el of elements) {
    const before = write(el);
    if (!before) continue;
    // ChangeElementCommand reads the new values at construction → after the write.
    if (batch && ChangeElementCommand) batch.addSubCommand(new ChangeElementCommand(el, before));
    changed.push(el);
  }
  if (batch && changed.length) sc.addCommandToHistory?.(batch);
  if (changed.length) sc.call?.('changed', changed);
  return changed;
}

/** Set opacity (percent) on every element; `from` = attrs to record as "before" (live drags). */
export function applyOpacity(sc, elements, percent, from = null) {
  const value = clampOpacity(percent);
  const attr = value >= 100 ? null : String(value / 100);
  return batchWrite(sc, elements, (el) => {
    const before = { opacity: from ? from.get(el) ?? null : el.getAttribute('opacity') };
    if (!from && before.opacity === attr) return null;
    if (attr == null) el.removeAttribute('opacity'); else el.setAttribute('opacity', attr);
    return before.opacity === attr ? null : before;
  }, `Opacity ${value}%`);
}

export const applyIsolate = (sc, groups, on) => batchWrite(sc, groups, (el) => writeIsolate(el, on), on ? 'Isolate Blending' : 'Release Isolate Blending');

const selectable = (sc) => (sc.getSelectedElements?.() || []).filter((el) => el && el.getAttribute && !el.classList?.contains('layer'));

export function mountTransparency(editor) {
  const sc = editor.svgCanvas;
  const pane = document.getElementById('vdock_transparency_panel');
  if (!pane) return null;
  pane.innerHTML = `
    <div class="vtr" id="vtr_panel">
      <div class="vtr-row">
        <select id="vtr_mode" class="vtr-select" aria-label="Blending mode" title="Blending Mode">${blendOptionsHtml()}</select>
        <label class="vtr-field" for="vtr_opacity" title="Opacity"><span class="vtr-label">Opacity:</span><input id="vtr_opacity" class="vtr-input" type="number" min="0" max="100" step="1" aria-label="Opacity"><em>%</em></label>
      </div>
      <input id="vtr_opacity_slider" class="vtr-slider" type="range" min="0" max="100" step="1" aria-label="Opacity slider">
      <label class="vtr-check" title="Blend the group's contents only with each other (groups)"><input type="checkbox" id="vtr_isolate"> Isolate Blending</label>
      <div class="vtr-empty" id="vtr_empty">Select an object to change its transparency.</div>
    </div>`;
  const $ = (id) => document.getElementById(id);
  const mode = $('vtr_mode'), op = $('vtr_opacity'), slider = $('vtr_opacity_slider'), iso = $('vtr_isolate');
  let live = null; // Map(el → original opacity attr) during a slider drag

  const sync = () => {
    const els = selectable(sc);
    const none = !els.length;
    $('vtr_empty').hidden = !none;
    for (const c of [mode, op, slider]) c.disabled = none;
    if (document.activeElement !== mode) mode.value = none ? 'normal' : selectionBlendMode(els);
    if (!live) {
      const v = none ? 100 : selectionOpacity(els);
      if (document.activeElement !== op) { op.value = v === '' ? '' : String(v); op.placeholder = v === '' ? 'Mixed' : ''; }
      slider.value = v === '' ? 100 : v;
      // Keep the Properties ▸ Appearance opacity spinner (SVG-Edit #opacity) as a mirror.
      const spin = document.getElementById('opacity');
      if (spin && !none && v !== '' && !spin.contains?.(document.activeElement) && String(spin.value) !== String(v)) spin.value = v;
    }
    const groups = els.filter((el) => el.tagName === 'g');
    iso.disabled = none || groups.length !== els.length;
    iso.checked = !iso.disabled && groups.every(readIsolate);
    iso.indeterminate = !iso.disabled && !iso.checked && groups.some(readIsolate);
  };

  mode.addEventListener('change', () => { if (mode.value) applyBlendMode(sc, selectable(sc), mode.value); sync(); });
  op.addEventListener('change', () => { if (op.value !== '') applyOpacity(sc, selectable(sc), op.value); sync(); });
  op.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') op.blur(); });
  slider.addEventListener('input', () => {
    const els = selectable(sc);
    if (!live) live = new Map(els.map((el) => [el, el.getAttribute('opacity')]));
    const v = clampOpacity(slider.value);
    for (const el of els) { if (v >= 100) el.removeAttribute('opacity'); else el.setAttribute('opacity', String(v / 100)); }
    op.value = String(v);
  });
  slider.addEventListener('change', () => {
    const from = live; live = null;
    applyOpacity(sc, selectable(sc), slider.value, from);
    sync();
  });
  iso.addEventListener('change', () => { applyIsolate(sc, selectable(sc).filter((el) => el.tagName === 'g'), iso.checked); sync(); });

  // Restore isolation styles after Open / undo / paste.
  let queued = false;
  const rehydrate = () => { queued = false; for (const el of sc.getSvgContent?.()?.querySelectorAll(`[${ISOLATE_ATTR}], [style*="isolation"]`) || []) syncIsolateStyle(el); };
  const schedule = () => { if (!queued) { queued = true; queueMicrotask(rehydrate); } };
  const root = sc.getSvgRoot?.() || sc.getSvgContent?.();
  if (root && typeof MutationObserver !== 'undefined') new MutationObserver(schedule).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: [ISOLATE_ATTR, 'style'] });
  const call = sc.call;
  sc.call = function (event, ...args) {
    const result = call.call(this, event, ...args);
    if (event === 'selected' || event === 'changed') { sync(); schedule(); }
    return result;
  };
  document.getElementById('action_window_transparency')?.addEventListener('click', () => window.__visterasDock?.toggle?.('transparency'));
  rehydrate();
  sync();
  const api = { sync, rehydrate, BLEND_ATTR };
  window.__visterasTransparency = api;
  return api;
}
