/**
 * Visteras Vector — live, non-destructive effects (Illustrator Effect menu / Appearance).
 *
 * Source of truth: data-visteras-fx (JSON) on the object. Rendering: one SVG
 * <filter id="vfx_<id>"> in <defs>, rebuilt from that JSON whenever it is missing or
 * stale (after Open — SVG-Edit's sanitizer strips feBlend@mode —, undo/redo, duplicate,
 * move/resize). Removing or disabling every effect removes the filter; unreferenced
 * vfx_ filters are swept, so no orphans are left in the file.
 * Undo: one BatchCommand per OK / toggle / remove recording data-visteras-fx + filter.
 */
export const FX_ATTR = 'data-visteras-fx';
export const FX_PREFIX = 'vfx_';
const NS = 'http://www.w3.org/2000/svg';

/** Illustrator Drop Shadow dialog defaults (Multiply, 75 %, 7/7, blur 5, black). */
export const FX_DEFAULTS = {
  dropShadow: { enabled: true, mode: 'multiply', opacity: 75, x: 7, y: 7, blur: 5, color: '#000000' },
  innerShadow: { enabled: true, mode: 'multiply', opacity: 75, x: 4, y: 4, blur: 5, color: '#000000' },
  colorAdjust: { enabled: true, brightness: 0, contrast: 0, saturation: 0, hue: 0 },
  gaussianBlur: { enabled: true, radius: 2 },
};
export const FX_ORDER = ['colorAdjust', 'gaussianBlur', 'innerShadow', 'dropShadow'];
export const FX_LABELS = { dropShadow: 'Drop Shadow', innerShadow: 'Inner Shadow', colorAdjust: 'Color Adjust', gaussianBlur: 'Gaussian Blur' };
export const SHADOW_MODES = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-burn', 'color-dodge', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];

const num = (v, d, min = -Infinity, max = Infinity) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : (/^#[0-9a-f]{3}$/i.test(String(v || '')) ? `#${String(v).slice(1).split('').map((c) => c + c).join('')}`.toLowerCase() : d));

/** Clamp/normalize one effect; unknown keys dropped. */
export function normalizeEffect(type, raw = {}) {
  const d = FX_DEFAULTS[type];
  if (!d) return null;
  const enabled = raw.enabled !== false;
  if (type === 'colorAdjust') {
    return { enabled, brightness: num(raw.brightness, 0, -100, 100), contrast: num(raw.contrast, 0, -100, 100), saturation: num(raw.saturation, 0, -100, 100), hue: num(raw.hue, 0, -180, 180) };
  }
  if (type === 'gaussianBlur') return { enabled, radius: num(raw.radius, d.radius, 0, 250) };
  return {
    enabled,
    mode: SHADOW_MODES.includes(raw.mode) ? raw.mode : d.mode,
    opacity: num(raw.opacity, d.opacity, 0, 100),
    x: num(raw.x, d.x, -1000, 1000),
    y: num(raw.y, d.y, -1000, 1000),
    blur: num(raw.blur, d.blur, 0, 250),
    color: hex(raw.color, d.color),
  };
}

export function parseFx(text) {
  let raw = null;
  try { raw = typeof text === 'string' ? JSON.parse(text) : text; } catch { raw = null; }
  const fx = {};
  if (raw && typeof raw === 'object') {
    for (const type of FX_ORDER) if (raw[type]) fx[type] = normalizeEffect(type, raw[type]);
  }
  return fx;
}

/** Stable JSON, or null when there are no effects. */
export function serializeFx(fx) {
  const out = {};
  for (const type of FX_ORDER) if (fx?.[type]) out[type] = normalizeEffect(type, fx[type]);
  return Object.keys(out).length ? JSON.stringify(out) : null;
}

export const hasActiveFx = (fx) => FX_ORDER.some((t) => fx?.[t]?.enabled);

const r = (n) => Math.round(n * 10000) / 10000;

/** Brightness/contrast as one feColorMatrix (offsets in 0..1). */
export function brightnessContrastMatrix(brightness = 0, contrast = 0) {
  const c = 1 + contrast / 100;
  const o = r(0.5 * (1 - c) + brightness / 100);
  const s = r(c);
  return `${s} 0 0 0 ${o} 0 ${s} 0 0 ${o} 0 0 ${s} 0 ${o} 0 0 0 1 0`;
}

/** Filter primitive specs ([tag, attrs, children?]) in render order. */
export function buildFilterPrimitives(fx) {
  const out = [];
  let cur = 'SourceGraphic';
  const ca = fx.colorAdjust;
  if (ca?.enabled && (ca.brightness || ca.contrast || ca.saturation || ca.hue)) {
    out.push(['feColorMatrix', { in: cur, type: 'matrix', values: brightnessContrastMatrix(ca.brightness, ca.contrast), result: 'vfxBC' }]);
    out.push(['feColorMatrix', { in: 'vfxBC', type: 'saturate', values: String(r(1 + ca.saturation / 100)), result: 'vfxSat' }]);
    out.push(['feColorMatrix', { in: 'vfxSat', type: 'hueRotate', values: String(ca.hue), result: 'vfxAdj' }]);
    cur = 'vfxAdj';
  }
  const gb = fx.gaussianBlur;
  if (gb?.enabled && gb.radius > 0) {
    out.push(['feGaussianBlur', { in: cur, stdDeviation: String(r(gb.radius / 2)), result: 'vfxBlur' }]);
    cur = 'vfxBlur';
  }
  const is = fx.innerShadow;
  if (is?.enabled) {
    out.push(['feFlood', { 'flood-color': is.color, 'flood-opacity': String(r(is.opacity / 100)), result: 'vfxIsFlood' }]);
    out.push(['feComposite', { in: 'vfxIsFlood', in2: 'SourceAlpha', operator: 'out', result: 'vfxIsOut' }]);
    out.push(['feOffset', { in: 'vfxIsOut', dx: String(is.x), dy: String(is.y), result: 'vfxIsOff' }]);
    out.push(['feGaussianBlur', { in: 'vfxIsOff', stdDeviation: String(r(is.blur / 2)), result: 'vfxIsBlur' }]);
    out.push(['feComposite', { in: 'vfxIsBlur', in2: 'SourceAlpha', operator: 'in', result: 'vfxIsIn' }]);
    out.push(['feBlend', { in: 'vfxIsIn', in2: cur, mode: is.mode, result: 'vfxInner' }]);
    cur = 'vfxInner';
  }
  const ds = fx.dropShadow;
  if (ds?.enabled) {
    out.push(['feGaussianBlur', { in: 'SourceAlpha', stdDeviation: String(r(ds.blur / 2)), result: 'vfxDsBlur' }]);
    out.push(['feOffset', { in: 'vfxDsBlur', dx: String(ds.x), dy: String(ds.y), result: 'vfxDsOff' }]);
    out.push(['feFlood', { 'flood-color': ds.color, 'flood-opacity': String(r(ds.opacity / 100)), result: 'vfxDsFlood' }]);
    out.push(['feComposite', { in: 'vfxDsFlood', in2: 'vfxDsOff', operator: 'in', result: 'vfxDs' }]);
    out.push(['feMerge', { result: 'vfxOut' }, [['feMergeNode', { in: 'vfxDs' }], ['feMergeNode', { in: cur }]]]);
  }
  return out;
}

/** Extra room around the bbox so shadows/blur are not clipped. */
export function filterPadding(fx) {
  let pad = 4;
  for (const t of ['dropShadow', 'innerShadow']) {
    const e = fx[t];
    if (e?.enabled) pad = Math.max(pad, Math.max(Math.abs(e.x), Math.abs(e.y)) + e.blur * 1.5 + 4);
  }
  if (fx.gaussianBlur?.enabled) pad = Math.max(pad, fx.gaussianBlur.radius * 1.5 + 4);
  return Math.ceil(pad);
}

/**
 * Painted extent of an object's effects, in its own user space. `bbox` is the
 * object's (stroked) box; Gaussian blur reaches ~3σ = 1.5 × the Illustrator blur
 * value. Inner shadow stays inside the shape. Pure (used by export scopes).
 */
export function visualBounds(fx, bbox) {
  const b = bbox || { x: 0, y: 0, width: 0, height: 0 };
  let x0 = b.x, y0 = b.y, x1 = b.x + b.width, y1 = b.y + b.height;
  const gb = fx?.gaussianBlur;
  if (gb?.enabled && gb.radius > 0) { const g = gb.radius * 1.5; x0 -= g; y0 -= g; x1 += g; y1 += g; }
  const ds = fx?.dropShadow;
  if (ds?.enabled) {
    const spread = ds.blur * 1.5 + (gb?.enabled ? gb.radius * 1.5 : 0);
    x0 = Math.min(x0, b.x + ds.x - spread); y0 = Math.min(y0, b.y + ds.y - spread);
    x1 = Math.max(x1, b.x + b.width + ds.x + spread); y1 = Math.max(y1, b.y + b.height + ds.y + spread);
  }
  return { x: r(x0), y: r(y0), width: r(x1 - x0), height: r(y1 - y0) };
}

const unionRect = (a, b) => {
  if (!a) return b; if (!b) return a;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
};

/** Half the stroke width (0 when unstroked) so filters and bounds include the stroke. */
export function strokeOutset(el) {
  const stroke = el?.getAttribute?.('stroke');
  if (!stroke || stroke === 'none') return 0;
  const w = Number.parseFloat(el.getAttribute('stroke-width') ?? '1');
  return Number.isFinite(w) && w > 0 ? w / 2 : 0;
}

const outsetRect = (b, d) => (b ? { x: b.x - d, y: b.y - d, width: b.width + d * 2, height: b.height + d * 2 } : b);

/**
 * Bounds of an element including filter/shadow extents, in #svgcontent user units
 * (same space as svgCanvas.getStrokedBBox). Groups include effects on descendants.
 * Export scopes use this so selection exports don't clip shadows.
 */
export function getVisualBounds(el, sc = null) {
  if (!el) return null;
  let base = null;
  try { base = sc?.getStrokedBBox?.([el]) || null; } catch { base = null; }
  if (!base) { try { const b = el.getBBox(); base = outsetRect({ x: b.x, y: b.y, width: b.width, height: b.height }, strokeOutset(el)); } catch { base = null; } }
  const owners = [el, ...(el.querySelectorAll?.(`[${FX_ATTR}]`) || [])].filter((n) => n.getAttribute?.(FX_ATTR));
  if (!owners.length) return base;
  const content = el.ownerSVGElement?.closest?.('#svgcontent') || el.closest?.('#svgcontent') || el.ownerSVGElement;
  let out = base;
  for (const owner of owners) {
    const fx = parseFx(owner.getAttribute(FX_ATTR));
    if (!hasActiveFx(fx)) continue;
    let local;
    try { const b = owner.getBBox(); local = outsetRect({ x: b.x, y: b.y, width: b.width, height: b.height }, strokeOutset(owner)); } catch { continue; }
    const v = visualBounds(fx, local);
    let m = null;
    try { const c = owner.getScreenCTM(), root = content?.getScreenCTM?.(); m = c && root ? root.inverse().multiply(c) : null; } catch { m = null; }
    const pts = [[v.x, v.y], [v.x + v.width, v.y], [v.x, v.y + v.height], [v.x + v.width, v.y + v.height]]
      .map(([x, y]) => (m ? [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f] : [x, y]));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    out = unionRect(out, { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) });
  }
  return out && { x: r(out.x), y: r(out.y), width: r(out.width), height: r(out.height) };
}

/** Filter element attributes for a bbox (user space so thin lines still render). */
export function filterRegion(fx, bbox) {
  const pad = filterPadding(fx);
  const b = bbox || { x: 0, y: 0, width: 0, height: 0 };
  return { filterUnits: 'userSpaceOnUse', x: r(b.x - pad), y: r(b.y - pad), width: r(b.width + pad * 2), height: r(b.height + pad * 2), 'color-interpolation-filters': 'sRGB' };
}

export const filterIdFor = (el) => `${FX_PREFIX}${el.id}`;
export const filterRef = (id) => `url(#${id})`;

/** Id of the filter an element points at (url(#id) / url("#id")). */
export function referencedFilterId(el) {
  const m = /url\(\s*["']?#([^"')]+)["']?\s*\)/.exec(el?.getAttribute?.('filter') || '');
  return m ? m[1] : null;
}

/**
 * Write effects onto an element's attributes (not the filter element). Returns the
 * previous attrs, or null if nothing changed.
 */
export function writeFx(el, fx) {
  const before = { [FX_ATTR]: el.getAttribute(FX_ATTR), filter: el.getAttribute('filter') };
  const json = serializeFx(fx);
  const active = json && hasActiveFx(parseFx(json));
  const ownRef = referencedFilterId(el)?.startsWith(FX_PREFIX);
  let filter = before.filter;
  if (active) filter = filterRef(filterIdFor(el));
  else if (ownRef) filter = null;
  if (json === before[FX_ATTR] && filter === before.filter) return null;
  if (json == null) el.removeAttribute(FX_ATTR); else el.setAttribute(FX_ATTR, json);
  if (filter == null) el.removeAttribute('filter'); else el.setAttribute('filter', filter);
  return before;
}

/** Apply an effects transform to many elements as one undo step. */
export function applyFx(sc, elements, mutate, label = 'Effects') {
  const { BatchCommand, ChangeElementCommand } = sc?.history || {};
  const batch = BatchCommand ? new BatchCommand(label) : null;
  const changed = [];
  for (const el of (elements || []).filter((e) => e?.getAttribute)) {
    const next = mutate(parseFx(el.getAttribute(FX_ATTR)), el);
    const before = writeFx(el, next);
    if (!before) continue;
    if (batch && ChangeElementCommand) batch.addSubCommand(new ChangeElementCommand(el, before));
    changed.push(el);
  }
  if (batch && changed.length) sc.addCommandToHistory?.(batch);
  if (changed.length) sc.call?.('changed', changed);
  return changed;
}

/** Signature of a built filter (skip rewriting when unchanged). */
export const filterSignature = (fx, region) => JSON.stringify([buildFilterPrimitives(fx), region]);

function makePrimitive(doc, [tag, attrs, children]) {
  const node = doc.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children || []) node.append(makePrimitive(doc, c));
  return node;
}

const BUILT = new WeakMap();

/** Ensure the element's own filter exists and matches its effects (DOM). */
export function syncElementFx(el, defs) {
  const fx = parseFx(el.getAttribute(FX_ATTR));
  const id = filterIdFor(el);
  const doc = el.ownerDocument;
  if (!hasActiveFx(fx)) {
    if (referencedFilterId(el)?.startsWith(FX_PREFIX)) el.removeAttribute('filter');
    return null;
  }
  if (el.getAttribute('filter') !== filterRef(id)) el.setAttribute('filter', filterRef(id)); // duplicate / reopen
  let bbox = null;
  try { const b = el.getBBox(); bbox = outsetRect({ x: b.x, y: b.y, width: b.width, height: b.height }, strokeOutset(el)); } catch { bbox = null; }
  const region = filterRegion(fx, bbox);
  const sig = filterSignature(fx, region);
  let filter = doc.getElementById(id);
  // Signature lives in memory only: a filter that came from a file (and went through
  // the SVG-Edit sanitizer, which strips e.g. feBlend mode) is always rebuilt once.
  if (filter && BUILT.get(filter) === sig && filter.parentNode === defs) return filter;
  if (!filter || filter.tagName.toLowerCase() !== 'filter') {
    filter = doc.createElementNS(NS, 'filter');
    filter.setAttribute('id', id);
  }
  for (const [k, v] of Object.entries(region)) filter.setAttribute(k, v);
  filter.removeAttribute('data-vfx-sig');
  BUILT.set(filter, sig);
  filter.replaceChildren(...buildFilterPrimitives(fx).map((p) => makePrimitive(doc, p)));
  if (filter.parentNode !== defs) defs.append(filter);
  return filter;
}

/** Rebuild every object's filter and remove vfx_ filters nobody uses. */
export function syncAllFx(content, defs) {
  if (!content || !defs) return;
  const keep = new Set();
  for (const el of content.querySelectorAll(`[${FX_ATTR}]`)) {
    if (el.closest('defs')) continue;
    const f = syncElementFx(el, defs);
    if (f) keep.add(f.id);
  }
  for (const f of content.querySelectorAll(`filter[id^="${FX_PREFIX}"]`)) {
    if (!keep.has(f.id)) f.remove();
  }
}

/* ───────────────────────────── UI ───────────────────────────── */

const FIELDS = {
  dropShadow: [
    ['mode', 'Mode', 'mode'], ['opacity', 'Opacity', 'number', { min: 0, max: 100, step: 1, unit: '%' }],
    ['x', 'X Offset', 'number', { min: -1000, max: 1000, step: 1, unit: 'px' }], ['y', 'Y Offset', 'number', { min: -1000, max: 1000, step: 1, unit: 'px' }],
    ['blur', 'Blur', 'number', { min: 0, max: 250, step: 0.5, unit: 'px' }], ['color', 'Color', 'color'],
  ],
  colorAdjust: [
    ['brightness', 'Brightness', 'range', { min: -100, max: 100, step: 1 }], ['contrast', 'Contrast', 'range', { min: -100, max: 100, step: 1 }],
    ['saturation', 'Saturation', 'range', { min: -100, max: 100, step: 1 }], ['hue', 'Hue', 'range', { min: -180, max: 180, step: 1, unit: '°' }],
  ],
  gaussianBlur: [['radius', 'Radius', 'number', { min: 0, max: 250, step: 0.5, unit: 'px' }]],
};
FIELDS.innerShadow = FIELDS.dropShadow;

export function summarizeEffect(type, e) {
  if (!e) return '';
  if (type === 'colorAdjust') return [['B', e.brightness], ['C', e.contrast], ['S', e.saturation], ['H', e.hue]].filter(([, v]) => v).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(' ') || 'No change';
  if (type === 'gaussianBlur') return `${e.radius}px`;
  return `${e.x}, ${e.y} · ${e.blur}px · ${e.opacity}%`;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const modeLabel = (m) => m.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

export function mountEffects(editor) {
  const sc = editor.svgCanvas;
  const list = document.getElementById('vfx_list');
  const addSel = document.getElementById('vfx_add');
  const section = document.getElementById('sec_effects');
  if (!list || !addSel) return null;

  const targets = () => (sc.getSelectedElements?.() || []).filter((el) => el && el.getAttribute && el.id && !el.classList?.contains('layer'));
  const defs = () => sc.findDefs?.();
  const content = () => sc.getSvgContent?.();
  const syncNow = () => { try { syncAllFx(content(), defs()); } catch (e) { console.warn('[effects] sync failed', e); } };
  let queued = false;
  const schedule = () => { if (!queued) { queued = true; queueMicrotask(() => { queued = false; syncNow(); }); } };

  const firstFx = () => { const t = targets()[0]; return t ? parseFx(t.getAttribute(FX_ATTR)) : {}; };
  const blurSlot = document.getElementById('slot_blur');

  const render = () => {
    const els = targets();
    if (section) section.style.display = els.length ? '' : 'none';
    const fx = firstFx();
    const active = FX_ORDER.filter((t) => fx[t]);
    list.innerHTML = active.length ? active.map((t) => `
      <div class="vfx_row${fx[t].enabled ? '' : ' vfx_off'}" data-type="${t}">
        <input type="checkbox" class="vfx_toggle" ${fx[t].enabled ? 'checked' : ''} aria-label="Show ${FX_LABELS[t]}" title="Toggle visibility">
        <button type="button" class="vfx_name" title="Edit ${FX_LABELS[t]}…">${FX_LABELS[t]}</button>
        <span class="vfx_summary">${esc(summarizeEffect(t, fx[t]))}</span>
        <button type="button" class="vfx_remove" aria-label="Remove ${FX_LABELS[t]}" title="Remove effect">×</button>
      </div>`).join('') : '<div class="vfx_empty">No effects</div>';
    for (const opt of addSel.options) if (opt.value) opt.disabled = !!fx[opt.value];
    // The SVG-Edit Blur slider writes its own filter; it is folded into Effects instead.
    if (blurSlot) {
      const busy = els.some((el) => el.hasAttribute(FX_ATTR));
      blurSlot.classList.toggle('vfx_blur_locked', busy);
      blurSlot.title = busy ? 'Blur is part of Effects for this object (Effects ▸ Gaussian Blur)' : '';
    }
  };

  const edit = (type, { isNew = false } = {}) => {
    const els = targets();
    if (!els.length) return;
    const originals = els.map((el) => ({ el, fx: el.getAttribute(FX_ATTR), filter: el.getAttribute('filter') }));
    const start = { ...(firstFx()[type] || FX_DEFAULTS[type]) };
    const restore = () => {
      for (const o of originals) {
        if (o.fx == null) o.el.removeAttribute(FX_ATTR); else o.el.setAttribute(FX_ATTR, o.fx);
        if (o.filter == null) o.el.removeAttribute('filter'); else o.el.setAttribute('filter', o.filter);
      }
      syncNow();
    };
    // Carry an SVG-Edit blur (filter url(#<id>_blur)) into Effects the first time.
    const legacyBlur = (el) => {
      const id = referencedFilterId(el);
      if (!id || id.startsWith(FX_PREFIX)) return null;
      const sd = Number(el.ownerDocument.getElementById(id)?.querySelector('feGaussianBlur')?.getAttribute('stdDeviation'));
      return Number.isFinite(sd) && sd > 0 ? { enabled: true, radius: sd * 2 } : null;
    };
    const mutateWith = (values) => (fx, el) => {
      const next = { ...fx, [type]: normalizeEffect(type, values) };
      if (!fx.gaussianBlur && type !== 'gaussianBlur') { const lb = legacyBlur(el); if (lb) next.gaussianBlur = lb; }
      return next;
    };

    const overlay = document.createElement('div');
    overlay.className = 'vui-overlay vfx_overlay';
    const dlg = document.createElement('div');
    dlg.className = 'vui-dialog vfx_dialog';
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-label', FX_LABELS[type]);
    const fieldHtml = FIELDS[type].map(([key, label, kind, o = {}]) => {
      const v = start[key];
      if (kind === 'mode') return `<label class="vfx_field"><span>${label}:</span><select data-key="${key}" class="vfx_select">${SHADOW_MODES.map((m) => `<option value="${m}"${m === v ? ' selected' : ''}>${modeLabel(m)}</option>`).join('')}</select></label>`;
      if (kind === 'color') return `<label class="vfx_field"><span>${label}:</span><input type="color" data-key="${key}" value="${esc(v)}"></label>`;
      if (kind === 'range') return `<label class="vfx_field vfx_field_range"><span>${label}:</span><input type="range" data-key="${key}" min="${o.min}" max="${o.max}" step="${o.step}" value="${v}"><input type="number" data-mirror="${key}" class="vpara_input" min="${o.min}" max="${o.max}" step="${o.step}" value="${v}">${o.unit ? `<em>${o.unit}</em>` : ''}</label>`;
      return `<label class="vfx_field"><span>${label}:</span><input type="number" class="vpara_input" data-key="${key}" min="${o.min}" max="${o.max}" step="${o.step}" value="${v}">${o.unit ? `<em>${o.unit}</em>` : ''}</label>`;
    }).join('');
    dlg.innerHTML = `
      <div class="vui-dialog-header"><span class="vui-dialog-title">${FX_LABELS[type]}</span><button type="button" class="vui-dialog-close" data-act="cancel" aria-label="Cancel">×</button></div>
      <div class="vui-dialog-body vfx_body">${fieldHtml}
        <label class="vfx_preview"><input type="checkbox" data-act="preview" checked> Preview</label></div>
      <div class="vui-dialog-actions"><button type="button" class="vui-btn vui-btn-secondary" data-act="cancel">Cancel</button><button type="button" class="vui-btn vui-btn-accent" data-act="ok">OK</button></div>`;
    document.body.append(overlay, dlg);
    const read = () => {
      const v = { ...start };
      for (const input of dlg.querySelectorAll('[data-key]')) v[input.dataset.key] = input.type === 'number' || input.type === 'range' ? Number(input.value) : input.value;
      return v;
    };
    const previewBox = dlg.querySelector('[data-act="preview"]');
    const preview = () => {
      restore();
      if (!previewBox.checked) return;
      for (const el of els) writeFx(el, mutateWith(read())(parseFx(el.getAttribute(FX_ATTR)), el));
      syncNow();
    };
    dlg.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.mirror) { const r = dlg.querySelector(`[data-key="${t.dataset.mirror}"]`); if (r) r.value = t.value; }
      else if (t.type === 'range') { const m = dlg.querySelector(`[data-mirror="${t.dataset.key}"]`); if (m) m.value = t.value; }
      preview();
    });
    const close = (ok) => {
      const values = read();
      document.removeEventListener('keydown', onKey, true);
      overlay.remove(); dlg.remove();
      restore();
      if (ok) applyFx(sc, els, mutateWith(values), `${isNew ? 'Add' : 'Edit'} ${FX_LABELS[type]}`);
      syncNow(); render();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); }
      else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); e.stopPropagation(); close(true); }
      else e.stopPropagation();
    };
    dlg.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'ok') close(true);
      else if (act === 'cancel') close(false);
      else if (act === 'preview') preview();
    });
    overlay.addEventListener('click', () => close(false));
    document.addEventListener('keydown', onKey, true);
    preview();
    dlg.querySelector('[data-key]')?.focus();
  };

  list.addEventListener('click', (e) => {
    const row = e.target.closest('.vfx_row');
    if (!row) return;
    const type = row.dataset.type;
    if (e.target.closest('.vfx_name')) edit(type);
    else if (e.target.closest('.vfx_remove')) {
      applyFx(sc, targets(), (fx) => { const n = { ...fx }; delete n[type]; return n; }, `Remove ${FX_LABELS[type]}`);
      syncNow(); render();
    }
  });
  list.addEventListener('change', (e) => {
    if (!e.target.classList.contains('vfx_toggle')) return;
    const type = e.target.closest('.vfx_row').dataset.type;
    const on = e.target.checked;
    applyFx(sc, targets(), (fx) => (fx[type] ? { ...fx, [type]: { ...fx[type], enabled: on } } : fx), `${on ? 'Show' : 'Hide'} ${FX_LABELS[type]}`);
    syncNow(); render();
  });
  addSel.addEventListener('change', () => {
    const type = addSel.value;
    addSel.value = '';
    if (type) edit(type, { isNew: true });
  });

  const root = sc.getSvgRoot?.() || content();
  if (root && typeof MutationObserver !== 'undefined') {
    new MutationObserver((records) => {
      // Ignore our own writes inside <filter> elements.
      if (records.every((r) => r.target?.closest?.(`filter[id^="${FX_PREFIX}"]`) || (r.type === 'attributes' && r.attributeName === 'filter' && !r.target.hasAttribute?.(FX_ATTR)))) return;
      schedule();
    }).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: [FX_ATTR, 'id'] });
  }
  const call = sc.call;
  sc.call = function (event, ...args) {
    const result = call.call(this, event, ...args);
    if (event === 'selected' || event === 'changed') { render(); schedule(); }
    return result;
  };
  window.__visterasEffects = { edit, render, sync: syncNow, getVisualBounds: (el) => getVisualBounds(el, sc) };
  syncNow();
  render();
  return window.__visterasEffects;
}
