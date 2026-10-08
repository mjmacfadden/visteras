/**
 * Visteras Vector — Select ▸ Inverse / Select ▸ Same ▸ …
 *
 * Skips locked and hidden objects (Illustrator). Compares normalized colors,
 * gradients by structure, effects by filter definition, opacity, stroke weight.
 */

import { formatShortcut, detectMac } from './visteras-shortcut-label.js';

function selected(sc) {
  return (sc?.getSelectedElements?.() || []).filter(Boolean);
}

function isLocked(el) {
  return el?.getAttribute?.('data-visteras-locked') === '1' || el?.getAttribute?.('pointer-events') === 'none' && el?.getAttribute?.('data-visteras-locked');
}

function isHidden(el) {
  return el?.getAttribute?.('data-visteras-hidden') === '1' || el?.style?.display === 'none' || el?.getAttribute?.('visibility') === 'hidden' || el?.getAttribute?.('display') === 'none';
}

export function isSelectableTarget(el) {
  if (!el || !el.tagName) return false;
  if (el.classList?.contains?.('layer')) return false;
  if (el.id === 'svgcontent' || el.tagName === 'defs' || el.tagName === 'clipPath') return false;
  if (el.closest?.('defs')) return false;
  if (isLocked(el) || isHidden(el)) return false;
  // Skip guide / grid overlays
  if (el.closest?.('#visteras_ruler_guides, #visteras_grid_overlay, .visteras-guides-layer')) return false;
  const tag = el.tagName.toLowerCase();
  return ['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'image', 'use', 'g', 'foreignObject'].includes(tag);
}

export function listSelectableInDocument(sc) {
  const root = sc?.getSvgContent?.() || document.getElementById('svgcontent');
  if (!root) return [];
  const out = [];
  const walk = (node) => {
    if (!node || node.nodeType !== 1) return;
    // Only consider direct drawable children of layers / groups that aren't themselves meta
    if (node.parentNode?.classList?.contains?.('layer') || node.parentNode === root || node.parentNode?.tagName === 'g') {
      if (isSelectableTarget(node) && node.parentNode?.classList?.contains?.('layer')) {
        out.push(node);
        // Don't descend into groups for inverse/same at leaf level — Illustrator selects top-level objects in layer;
        // for groups, the group itself is the selectable unit.
        return;
      }
      if (isSelectableTarget(node) && node.tagName === 'g' && !node.classList?.contains?.('layer')) {
        out.push(node);
        return;
      }
      if (isSelectableTarget(node) && node.tagName !== 'g') {
        // child of a group — only include if parent is a layer (top-level)
        if (node.parentNode?.classList?.contains?.('layer')) out.push(node);
        return;
      }
    }
    if (node.classList?.contains?.('layer') || node === root) {
      [...node.children].forEach(walk);
    }
  };
  walk(root);
  // Simpler reliable approach: all direct children of g.layer
  const layers = root.querySelectorAll?.('g.layer') || [];
  const simple = [];
  layers.forEach((layer) => {
    [...layer.children].forEach((ch) => {
      if (isSelectableTarget(ch)) simple.push(ch);
    });
  });
  return simple.length ? simple : out;
}

/** Normalize a CSS/SVG color to lowercase hex or special tokens. */
export function normalizeColor(value) {
  if (value == null) return 'none';
  let v = String(value).trim().toLowerCase();
  if (!v || v === 'none' || v === 'transparent') return 'none';
  if (v.startsWith('url(')) return v.replace(/\s+/g, '');
  // rgb(r,g,b)
  const rgb = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (rgb) {
    const hex = (n) => Math.max(0, Math.min(255, Math.round(Number(n)))).toString(16).padStart(2, '0');
    return `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`;
  }
  if (/^#[0-9a-f]{3}$/.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  return v;
}

export function paintSignature(el, which) {
  // which: 'fill' | 'stroke'
  const raw = el.getAttribute?.(which) || (which === 'fill' ? '#000000' : 'none');
  const norm = normalizeColor(raw);
  if (norm.startsWith('url(')) {
    // Gradient / pattern structure
    const id = norm.match(/url\(#([^)]+)\)/)?.[1];
    const doc = el.ownerDocument || document;
    const ref = id ? doc.getElementById(id) : null;
    if (!ref) return `url:${id || '?'}`;
    if (ref.tagName === 'linearGradient' || ref.tagName === 'radialGradient') {
      const stops = [...ref.querySelectorAll('stop')].map((s) => ({
        o: s.getAttribute('offset'),
        c: normalizeColor(s.getAttribute('stop-color')),
        a: s.getAttribute('stop-opacity'),
      }));
      return `${ref.tagName}:${JSON.stringify({
        x1: ref.getAttribute('x1'), y1: ref.getAttribute('y1'),
        x2: ref.getAttribute('x2'), y2: ref.getAttribute('y2'),
        cx: ref.getAttribute('cx'), cy: ref.getAttribute('cy'), r: ref.getAttribute('r'),
        stops,
      })}`;
    }
    return `${ref.tagName}:${id}`;
  }
  return norm;
}

export function strokeWeightSignature(el) {
  const w = el.getAttribute?.('data-visteras-stroke-weight') || el.getAttribute?.('stroke-width') || '0';
  const n = parseFloat(w);
  return Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : '0';
}

export function opacitySignature(el) {
  const o = el.getAttribute?.('opacity');
  if (o == null || o === '') return '1';
  const n = parseFloat(o);
  return Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : '1';
}

export function appearanceSignature(el) {
  const filter = el.getAttribute?.('filter') || '';
  const filterId = filter.match(/url\(#([^)]+)\)/)?.[1];
  let filterDef = '';
  if (filterId) {
    const ref = (el.ownerDocument || document).getElementById(filterId);
    filterDef = ref ? ref.innerHTML.replace(/\s+/g, ' ').trim() : filterId;
  }
  return JSON.stringify({
    fill: paintSignature(el, 'fill'),
    stroke: paintSignature(el, 'stroke'),
    sw: strokeWeightSignature(el),
    op: opacitySignature(el),
    filter: filterDef,
  });
}

export function sameKey(el, kind) {
  switch (kind) {
    case 'fill': return paintSignature(el, 'fill');
    case 'stroke': return paintSignature(el, 'stroke');
    case 'strokeWeight': return strokeWeightSignature(el);
    case 'fillStroke': return JSON.stringify({ f: paintSignature(el, 'fill'), s: paintSignature(el, 'stroke'), w: strokeWeightSignature(el) });
    case 'opacity': return opacitySignature(el);
    case 'appearance': return appearanceSignature(el);
    default: return '';
  }
}

export function selectInverse(sc) {
  const all = listSelectableInDocument(sc);
  const cur = new Set(selected(sc));
  const next = all.filter((el) => !cur.has(el));
  sc.clearSelection?.();
  if (next.length) sc.addToSelection?.(next, true);
  sc.call?.('selected', next);
  return next;
}

export function selectSame(sc, kind) {
  const sel = selected(sc);
  if (!sel.length) {
    window.showStudioToast?.('Select an object to match.', 'error', 2500);
    return [];
  }
  // Illustrator uses the first selected as the reference when multi-selected
  const ref = sel[0];
  const key = sameKey(ref, kind);
  const all = listSelectableInDocument(sc);
  const next = all.filter((el) => sameKey(el, kind) === key);
  sc.clearSelection?.();
  if (next.length) sc.addToSelection?.(next, true);
  sc.call?.('selected', next);
  return next;
}

function injectSelectMenu() {
  if (document.getElementById('menu_select')) return;
  const mac = detectMac();
  // Illustrator order: after Object (or Text). Place after #menu_object.
  const objectMenu = document.getElementById('menu_object');
  if (!objectMenu?.parentNode) return;

  const entry = document.createElement('div');
  entry.className = 'menu_entry';
  entry.id = 'menu_select';
  entry.innerHTML = `
    <div class="menu_entry_title">Select</div>
    <div class="menu_dropdown_list">
      <div class="menu_dropdown_item" id="action_select_all_menu">All <span class="menu_dropdown_shortcut" data-shortcut="Meta+A">${formatShortcut({ meta: true, key: 'A', mac })}</span></div>
      <div class="menu_dropdown_item" id="action_deselect_all_menu">Deselect <span class="menu_dropdown_shortcut" data-shortcut="Shift+Meta+A">${formatShortcut({ meta: true, shift: true, key: 'A', mac })}</span></div>
      <div class="menu_dropdown_item" id="action_select_inverse">Inverse <span class="menu_dropdown_shortcut" data-shortcut="Shift+Meta+I">${formatShortcut({ meta: true, shift: true, key: 'I', mac })}</span></div>
      <div class="menu_dropdown_separator"></div>
      <div class="menu_dropdown_item menu_has_submenu" role="menuitem" aria-haspopup="true" id="menu_select_same">
        Same<span class="menu_submenu_arrow" aria-hidden="true">▸</span>
        <div class="menu_dropdown_list menu_submenu_list" role="menu">
          <div class="menu_dropdown_item disabled" id="action_select_same_fill">Fill Color</div>
          <div class="menu_dropdown_item disabled" id="action_select_same_stroke">Stroke Color</div>
          <div class="menu_dropdown_item disabled" id="action_select_same_weight">Stroke Weight</div>
          <div class="menu_dropdown_item disabled" id="action_select_same_fillstroke">Fill &amp; Stroke</div>
          <div class="menu_dropdown_item disabled" id="action_select_same_opacity">Opacity</div>
          <div class="menu_dropdown_item disabled" id="action_select_same_appearance">Appearance</div>
        </div>
      </div>
    </div>
  `;
  // Insert after Object
  objectMenu.after(entry);
}

function syncSelectMenu(sc) {
  const n = selected(sc).length;
  for (const id of [
    'action_select_same_fill',
    'action_select_same_stroke',
    'action_select_same_weight',
    'action_select_same_fillstroke',
    'action_select_same_opacity',
    'action_select_same_appearance',
  ]) {
    document.getElementById(id)?.classList.toggle('disabled', n < 1);
  }
}

export function mountSelectSame(editor) {
  const sc = editor?.svgCanvas;
  if (!sc) return null;
  if (window.__visterasSelectSame) return window.__visterasSelectSame;

  injectSelectMenu();

  const click = (id, fn) => {
    document.getElementById(id)?.addEventListener('click', (e) => {
      if (e.currentTarget.classList.contains('disabled')) return;
      fn();
      syncSelectMenu(sc);
    });
  };

  click('action_select_all_menu', () => document.getElementById('action_select_all')?.click());
  click('action_deselect_all_menu', () => document.getElementById('action_deselect_all')?.click());
  click('action_select_inverse', () => selectInverse(sc));
  click('action_select_same_fill', () => selectSame(sc, 'fill'));
  click('action_select_same_stroke', () => selectSame(sc, 'stroke'));
  click('action_select_same_weight', () => selectSame(sc, 'strokeWeight'));
  click('action_select_same_fillstroke', () => selectSame(sc, 'fillStroke'));
  click('action_select_same_opacity', () => selectSame(sc, 'opacity'));
  click('action_select_same_appearance', () => selectSame(sc, 'appearance'));

  window.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.altKey) return;
    if (['input', 'textarea', 'select'].includes(document.activeElement?.tagName?.toLowerCase())) return;
    if (window.__visterasIsTypingDirectly) return;
    if (e.key === 'i' || e.key === 'I') {
      e.preventDefault();
      e.stopPropagation();
      selectInverse(sc);
      syncSelectMenu(sc);
    }
  }, true);

  const origCall = sc.call;
  sc.call = function (event, ...args) {
    const result = origCall.call(this, event, ...args);
    if (event === 'selected' || event === 'changed') syncSelectMenu(sc);
    return result;
  };
  syncSelectMenu(sc);

  const api = {
    selectInverse: () => selectInverse(sc),
    selectSame: (kind) => selectSame(sc, kind),
    normalizeColor,
    paintSignature,
    sameKey,
    listSelectableInDocument: () => listSelectableInDocument(sc),
    syncMenu: () => syncSelectMenu(sc),
  };
  window.__visterasSelectSame = api;
  return api;
}

export default mountSelectSame;
