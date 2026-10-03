/**
 * Visteras Vector — Eyedropper Tool (I), Illustrator behaviour (MVP).
 *
 * • Click an object WITH a selection → the clicked object's appearance is
 *   applied to every selected object (one undo step). Selection is unchanged.
 * • Click an object with NOTHING selected → its appearance becomes the current
 *   defaults (fill/stroke wells, weight, opacity, dashes, caps/joins, align).
 * • Option/Alt-click an object → the current selection's appearance (or the
 *   current defaults when nothing is selected) is applied to the clicked object.
 * • Hold Cmd/Ctrl → temporarily switch to the last selection tool; releasing
 *   the key returns to the Eyedropper (deferred until the mouse is released).
 * • Click empty canvas → no-op. Esc → Select tool.
 *
 * Appearance = fill, fill-opacity, stroke, stroke-opacity, user stroke weight,
 * stroke align, dasharray, linecap, linejoin, miterlimit, opacity and
 * mix-blend-mode. Values are read from the computed style, so paint inherited
 * from a group, inline style="" and CSS classes are all honoured. Missing /
 * default values reset the corresponding property on the target.
 *
 * Raster sampling (visteras-eyedropper-raster.js):
 * • Click a placed <image> → point-sample the pixel under the cursor. As in
 *   Illustrator the image counts as fill-only paint: fill = pixel colour AND
 *   stroke = none on the selection (one undo step; Inside/Outside stroke-align
 *   helpers are removed and come back on undo) or, with nothing selected, as
 *   the defaults (fill = colour, stroke = none, colour → recent).
 * • Shift-click any object → sample the rendered pixel under the cursor.
 *   The colour goes to the active fill/stroke well only: onto the selection
 *   (one undo step, selection kept) or, with nothing selected, into the default
 *   well + recent colours. Transparent pixels (alpha 0) are a no-op.
 * • The selection box/handles stay visible (non-interactive) while the tool is
 *   active and after every apply / undo / redo (visteras-selection.js).
 *   Cross-origin (tainted) images fall back to window.EyeDropper, then a toast.
 *
 * Not yet: desktop sampling outside the canvas, Shift+Alt append,
 * character/paragraph styles, the Eyedropper Options dialog, a filled cursor.
 */

import {
  createImageSampler, sampleImageElementAt, sampleRenderedAt, sampleWithFallback, imageHref, imageGeometry,
} from './visteras-eyedropper-raster.js?v=raster-1';
import { parseCssPaint } from './visteras-paint-resolver.js?v=paint-resolver-2';

const MODE = 'eyedropper';

const STROKE_ALIGN_ATTR = 'data-visteras-stroke-align';
const STROKE_WEIGHT_ATTR = 'data-visteras-stroke-weight';
const STROKE_PAINT_ATTR = 'data-visteras-stroke-paint';
const STROKE_HELPER_ATTR = 'data-visteras-stroke-align-helper';
const STROKE_HELPER_FOR_ATTR = 'data-visteras-helper-for';
const STROKE_WRAP_ATTR = 'data-visteras-sa-wrap';
const STROKE_BODY_ATTR = 'data-visteras-sa-body';
const STROKE_CLIP_ATTR = 'data-visteras-sa-clip';
const STROKE_MASK_ATTR = 'data-visteras-sa-mask';

/** Leaf elements the eyedropper can sample from / apply to. */
export const LEAF_TAGS = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line', 'text']);

/** Option group → SVG properties it covers ('stroke-align' is virtual). */
const GROUPS = {
  Fill: ['fill', 'fill-opacity'],
  Stroke: ['stroke', 'stroke-opacity'],
  StrokeWidth: ['stroke-width'],
  StrokeAlign: ['stroke-align'],
  Opacity: ['opacity'],
  StrokeDash: ['stroke-dasharray'],
  StrokeCaps: ['stroke-linecap', 'stroke-linejoin'],
  Miter: ['stroke-miterlimit'],
  Blend: ['mix-blend-mode'],
};

/** Initial/default values: a sampled default resets the target property. */
const DEFAULTS = {
  'fill-opacity': '1',
  'stroke-opacity': '1',
  'stroke-dasharray': 'none',
  'stroke-linecap': 'butt',
  'stroke-linejoin': 'miter',
  'stroke-miterlimit': '4',
  opacity: '1',
  'mix-blend-mode': 'normal',
};

// ─── Options (persisted) ─────────────────────────────────────────────────────
/** Options: which attributes to include when sampling / applying */
let _options = {
  sampleFill: true,
  sampleStroke: true,
  sampleStrokeWidth: true,
  sampleOpacity: true,
  sampleStrokeDash: true,
  sampleStrokeCaps: true,
  sampleStrokeAlign: true,
  sampleMiter: true,
  sampleBlend: true,
  applyFill: true,
  applyStroke: true,
  applyStrokeWidth: true,
  applyOpacity: true,
  applyStrokeDash: true,
  applyStrokeCaps: true,
  applyStrokeAlign: true,
  applyMiter: true,
  applyBlend: true,
};

// Load persisted options from localStorage
function _loadOptions() {
  try {
    const stored = localStorage.getItem('visteras_eyedropper_options');
    if (stored) Object.assign(_options, JSON.parse(stored));
  } catch (_) { /* ignore */ }
}

function _saveOptions() {
  try {
    localStorage.setItem('visteras_eyedropper_options', JSON.stringify(_options));
  } catch (_) { /* ignore */ }
}

function enabledProps(kind) {
  const out = new Set();
  for (const [group, props] of Object.entries(GROUPS)) {
    if (_options[kind + group] !== false) props.forEach((p) => out.add(p));
  }
  return out;
}

// ─── Pure helpers ────────────────────────────────────────────────────────────
const attr = (el, name) => (el && typeof el.getAttribute === 'function' ? el.getAttribute(name) : null);
const hasAttr = (el, name) => attr(el, name) != null;

export function isStrokeHelper(el) { return hasAttr(el, STROKE_HELPER_ATTR); }
export function isStrokeWrap(el) { return hasAttr(el, STROKE_WRAP_ATTR); }

/**
 * Map a stroke-align helper or wrap to its user body (the element that owns
 * the appearance). Other elements are returned unchanged.
 */
export function resolveBody(el, api = null) {
  if (!el) return null;
  if (api?.resolveStrokeAlignBody && (isStrokeHelper(el) || isStrokeWrap(el))) {
    return api.resolveStrokeAlignBody(el) || el;
  }
  if (isStrokeHelper(el)) {
    const id = attr(el, STROKE_HELPER_FOR_ATTR);
    const doc = el.ownerDocument || (typeof document !== 'undefined' ? document : null);
    const byId = id && doc?.getElementById?.(id);
    if (byId) return byId;
    const parent = el.parentNode;
    if (parent && isStrokeWrap(parent)) {
      for (const c of parent.children || []) if (hasAttr(c, STROKE_BODY_ATTR)) return c;
    }
    return el;
  }
  if (isStrokeWrap(el)) {
    for (const c of el.children || []) if (hasAttr(c, STROKE_BODY_ATTR)) return c;
  }
  return el;
}

function hexByte(n) { return Math.max(0, Math.min(255, Math.round(Number(n)))).toString(16).padStart(2, '0'); }

/** Normalise a paint value: rgb()→#hex, url("…#id")→url(#id), transparent→none. */
export function normalizePaint(v) {
  if (v == null) return null;
  let s = String(v).trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower === 'none' || lower === 'transparent') return 'none';
  const url = s.match(/^url\(\s*["']?[^"')]*?(#[^"')\s]+)["']?\s*\)/i);
  if (url) return `url(${url[1]})`;
  const rgb = lower.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/);
  if (rgb) {
    if (rgb[4] != null) {
      const a = rgb[4].endsWith('%') ? parseFloat(rgb[4]) / 100 : parseFloat(rgb[4]);
      if (a === 0) return 'none';
    }
    return `#${hexByte(rgb[1])}${hexByte(rgb[2])}${hexByte(rgb[3])}`;
  }
  if (/^#[0-9a-f]{3}$/i.test(s) || /^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  return s;
}

/** "5px, 3px" → "5 3"; none/empty → none. */
export function normalizeDash(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || s === 'none') return 'none';
  const parts = s.split(/[\s,]+/).filter(Boolean).map((p) => {
    const n = parseFloat(p);
    return Number.isFinite(n) ? String(+n.toFixed(4)) : p;
  });
  if (!parts.length || parts.every((p) => p === '0')) return 'none';
  return parts.join(' ');
}

function normalizeNumber(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? String(+n.toFixed(4)) : null;
}

function inlineStyleValue(el, prop) {
  const v = el?.style?.getPropertyValue?.(prop);
  return v ? v.trim() : null;
}

function isDefault(prop, v) {
  if (v == null) return true;
  if (!(prop in DEFAULTS)) return false;
  if (prop === 'stroke-dasharray') return normalizeDash(v) === 'none';
  if (prop.endsWith('opacity') || prop === 'stroke-miterlimit') return Number(v) === Number(DEFAULTS[prop]);
  return String(v).trim().toLowerCase() === DEFAULTS[prop];
}

function readAlign(el, api) {
  if (api?.readElementStrokeAlign) return api.readElementStrokeAlign(el);
  const a = String(attr(el, STROKE_ALIGN_ATTR) || 'center').toLowerCase();
  return a === 'inside' || a === 'outside' ? a : 'center';
}

function readWeight(el, api) {
  if (api?.readElementStrokeWeight) {
    const w = api.readElementStrokeWeight(el);
    if (w != null) return w;
  }
  const stored = attr(el, STROKE_WEIGHT_ATTR);
  if (stored != null && stored !== '' && Number.isFinite(Number(stored))) return Number(stored);
  return null;
}

/**
 * Sample the appearance of an element. Returns a map of property → value for
 * every enabled sample option; a null value means "absent/default — reset it
 * on the target". Uses getComputedStyle when available (browser), otherwise
 * attributes + inline style (Node tests).
 *
 * @param {Element} el
 * @param {{getComputedStyle?:Function, api?:object}} [env]
 * @returns {Record<string,string|null>}
 */
export function sampleStyleFrom(el, env = {}) {
  const api = env.api || null;
  el = resolveBody(el, api);
  if (!el || ['svg', 'g', 'use', 'defs'].includes(el.nodeName)) return {};
  const gcs = env.getComputedStyle !== undefined
    ? env.getComputedStyle
    : (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function' ? window.getComputedStyle.bind(window) : null);
  let cs = null;
  if (gcs) { try { cs = gcs(el); } catch { cs = null; } }
  const read = (prop) => {
    if (cs) {
      const v = cs.getPropertyValue(prop);
      return v != null && String(v).trim() !== '' ? String(v).trim() : null;
    }
    return inlineStyleValue(el, prop) ?? attr(el, prop);
  };

  const want = enabledProps('sample');
  const s = {};
  const aligned = readAlign(el, api) !== 'center';

  if (want.has('fill')) s.fill = normalizePaint(read('fill'));
  if (want.has('stroke')) {
    let st = normalizePaint(read('stroke'));
    // Inside/Outside aligned bodies render with stroke="none"; the real paint
    // is stored on the body.
    if (aligned && (st == null || st === 'none')) {
      const stored = attr(el, STROKE_PAINT_ATTR);
      if (stored != null && stored !== '') st = normalizePaint(stored);
    }
    s.stroke = st;
  }
  for (const prop of ['fill-opacity', 'stroke-opacity', 'opacity', 'stroke-miterlimit']) {
    if (!want.has(prop)) continue;
    const v = normalizeNumber(read(prop));
    s[prop] = isDefault(prop, v) ? null : v;
  }
  if (want.has('stroke-width')) {
    const w = readWeight(el, api);
    s['stroke-width'] = w != null ? String(w) : normalizeNumber(read('stroke-width'));
  }
  if (want.has('stroke-align')) s['stroke-align'] = readAlign(el, api);
  if (want.has('stroke-dasharray')) {
    const d = normalizeDash(read('stroke-dasharray'));
    s['stroke-dasharray'] = isDefault('stroke-dasharray', d) ? null : d;
  }
  for (const prop of ['stroke-linecap', 'stroke-linejoin', 'mix-blend-mode']) {
    if (!want.has(prop)) continue;
    const v = read(prop);
    s[prop] = isDefault(prop, v) ? null : String(v).trim();
  }
  return s;
}

/** Expand targets: groups → painted leaves, wraps/helpers → body. */
export function expandTargets(targets, api = null) {
  const out = [];
  const seen = new Set();
  const push = (el) => {
    const b = resolveBody(el, api);
    if (!b || seen.has(b) || !LEAF_TAGS.has(b.nodeName)) return;
    if (isStrokeHelper(b)) return;
    seen.add(b);
    out.push(b);
  };
  const walk = (el) => {
    if (!el) return;
    if (isStrokeWrap(el)) { push(el); return; }
    if (el.nodeName === 'g' || el.nodeName === 'a') {
      for (const c of el.children || []) walk(c);
      return;
    }
    if (el.nodeName === 'tspan' || el.nodeName === 'textPath') { walk(el.closest?.('text')); return; }
    push(el);
  };
  for (const t of targets || []) walk(t);
  return out;
}

const ALIGN_RECORD = [STROKE_ALIGN_ATTR, STROKE_WEIGHT_ATTR, STROKE_PAINT_ATTR, 'stroke', 'stroke-width', 'clip-path', 'mask'];
/** Everything stroke-align leaves on a body; dropped when the stroke goes to none. */
const ALIGN_STATE_ATTRS = [STROKE_ALIGN_ATTR, STROKE_WEIGHT_ATTR, STROKE_PAINT_ATTR, STROKE_BODY_ATTR, STROKE_CLIP_ATTR, STROKE_MASK_ATTR];

/**
 * Style for a pixel sample.
 * Plain click on a raster <image>: Illustrator treats the image as fill-only
 * paint → fill = colour, stroke = none. Shift-click (rendered sample): the
 * colour goes to the active well only.
 * @param {string} hex
 * @param {{fromImage?:boolean, well?:'fill'|'stroke'}} [opts]
 */
export function pixelSampleStyle(hex, opts = {}) {
  if (!hex) return null;
  if (opts.fromImage) return { fill: hex, stroke: 'none' };
  return { [opts.well === 'stroke' ? 'stroke' : 'fill']: hex };
}

/** Does el carry any Inside/Outside stroke-align state (attrs, helper, wrap)? */
export function hasStrokeAlignState(el) {
  if (!el) return false;
  if (ALIGN_STATE_ATTRS.some((n) => hasAttr(el, n))) return true;
  return isStrokeWrap(el.parentNode);
}

/**
 * Apply a sampled appearance to targets as ONE undo step.
 * @param {Element[]} targets
 * @param {Record<string,string|null>} style from sampleStyleFrom
 * @param {{ChangeElementCommand:any, BatchCommand?:any, undoMgr:any}} history
 * @param {{api?:object, sc?:object, name?:string, afterHistory?:Function}} [env]
 * @returns {object|null} the history command
 */
export function applyStyleToElements(targets, style, history, env = {}) {
  const api = env.api || null;
  const sc = env.sc || null;
  const elems = expandTargets(targets, api);
  if (!elems.length || !style || !Object.keys(style).length) return null;
  // Pixel samples (env.ignoreOptions) always paint the active well.
  const allowed = env.ignoreOptions ? null : enabledProps('apply');
  const keys = Object.keys(style).filter((k) => !allowed || allowed.has(k));
  if (!keys.length) return null;
  const { ChangeElementCommand, BatchCommand } = history;

  const subs = [];
  const alignTouched = [];
  for (const el of elems) {
    const before = {};
    const record = (name) => { if (!(name in before)) before[name] = attr(el, name); };
    const setAttr = (name, v) => {
      record(name);
      if (v == null || v === '') el.removeAttribute(name); else el.setAttribute(name, String(v));
    };
    const stripInline = (prop) => {
      if (inlineStyleValue(el, prop) == null) return;
      record('style');
      el.style.removeProperty(prop);
      if (!attr(el, 'style')?.trim()) el.removeAttribute('style');
    };
    let wasAligned = hasAttr(el, STROKE_ALIGN_ATTR) && readAlign(el, api) !== 'center';
    let weight = null;

    // Stroke → none (image sample): drop stroke-align entirely — helper,
    // clip/mask defs, wrap and data attributes. The recorded attrs let undo
    // restore them, and the batch resync re-renders the helper.
    const strokeOff = keys.includes('stroke') && (style.stroke == null || style.stroke === 'none');
    if (env.dropStrokeAlign && strokeOff && hasStrokeAlignState(el)) {
      ALIGN_RECORD.forEach(record);
      ALIGN_STATE_ATTRS.forEach(record);
      record('transform'); // unwrap may bake a wrap transform onto the body
      if (api?.applyStrokeAlignToElement && sc) {
        try { api.applyStrokeAlignToElement(el, sc, { align: 'center', userWidth: readWeight(el, api) ?? 1 }); } catch { /* ignore */ }
      }
      ALIGN_STATE_ATTRS.forEach((n) => setAttr(n, null));
      wasAligned = false;
      alignTouched.push(el);
    }

    for (const k of keys) {
      if (k === 'stroke-align') continue;
      const v = style[k];
      if (k === 'mix-blend-mode') {
        if (el.style) {
          record('style');
          if (v == null) el.style.removeProperty('mix-blend-mode');
          else el.style.setProperty('mix-blend-mode', v);
          if (!attr(el, 'style')?.trim()) el.removeAttribute('style');
          // Keep the stored mode (visteras-blend-modes.js) in sync so it survives reload.
          record('data-visteras-blend');
          setAttr('data-visteras-blend', v == null || v === 'normal' ? null : v);
        }
        continue;
      }
      if (k === 'stroke-width') {
        if (v == null) continue; // no weight info: keep target weight
        weight = Number(v);
        setAttr('stroke-width', v);
        if (hasAttr(el, STROKE_WEIGHT_ATTR) || wasAligned) setAttr(STROKE_WEIGHT_ATTR, v);
        stripInline('stroke-width');
        continue;
      }
      if (k === 'stroke' && wasAligned) {
        // Keep the stored paint in sync so align re-render uses the new paint.
        setAttr(STROKE_PAINT_ATTR, v == null ? 'none' : v);
      }
      setAttr(k, (k === 'stroke-dasharray' && v === 'none') ? null : v);
      stripInline(k);
    }

    // Stroke align: (re)render via the colour system so helpers stay correct.
    const wantAlign = keys.includes('stroke-align') && style['stroke-align'] ? style['stroke-align'] : readAlign(el, api);
    if (api?.applyStrokeAlignToElement && sc && (wantAlign !== 'center' || wasAligned)) {
      ALIGN_RECORD.forEach(record);
      const w = weight != null ? weight : (readWeight(el, api) ?? 1);
      try { api.applyStrokeAlignToElement(el, sc, { align: wantAlign, userWidth: w }); } catch { /* ignore */ }
      alignTouched.push(el);
    } else if (keys.includes('stroke-align') && style['stroke-align'] && hasAttr(el, STROKE_ALIGN_ATTR)) {
      setAttr(STROKE_ALIGN_ATTR, style['stroke-align']);
    }

    const changed = Object.keys(before).some((n) => before[n] !== attr(el, n));
    if (changed) subs.push(new ChangeElementCommand(el, before));
  }
  if (!subs.length) return null;

  let cmd = null;
  if (BatchCommand) {
    const resync = () => {
      if (!api?.applyStrokeAlignToElement || !sc) return;
      for (const el of alignTouched) {
        try {
          const align = readAlign(el, api);
          if (align !== 'center') {
            api.applyStrokeAlignToElement(el, sc, { align, userWidth: readWeight(el, api) ?? 1 });
          } else {
            // Clear helpers, then restore the exact recorded attributes.
            const snap = {};
            ALIGN_RECORD.forEach((n) => { snap[n] = attr(el, n); });
            api.applyStrokeAlignToElement(el, sc, { align: 'center', userWidth: readWeight(el, api) ?? 1 });
            for (const [n, v] of Object.entries(snap)) {
              if (v == null) el.removeAttribute(n); else el.setAttribute(n, v);
            }
          }
        } catch { /* ignore */ }
      }
    };
    class EyedropperCommand extends BatchCommand {
      unapply(handler) { super.unapply?.(handler); resync(); env.afterHistory?.(); }
      apply(handler) { super.apply?.(handler); resync(); env.afterHistory?.(); }
    }
    cmd = new EyedropperCommand(env.name || 'Eyedropper Apply');
    subs.forEach((c) => cmd.addSubCommand(c));
    history.undoMgr.addCommandToHistory(cmd);
  } else {
    subs.forEach((c) => history.undoMgr.addCommandToHistory(c));
    cmd = subs[0];
  }
  return cmd;
}

/** Build an appearance map from SVG-Edit's current (default) style. */
export function styleFromCurShape(cur = {}) {
  const hex = (v) => {
    if (v == null) return null;
    const s = String(v).trim();
    if (/^[0-9a-f]{6}$/i.test(s)) return `#${s.toLowerCase()}`;
    return normalizePaint(s);
  };
  const num = (v, prop) => { const n = normalizeNumber(v); return isDefault(prop, n) ? null : n; };
  const want = enabledProps('sample');
  const s = {};
  if (want.has('fill')) s.fill = hex(cur.fill);
  if (want.has('stroke')) s.stroke = hex(cur.stroke);
  if (want.has('fill-opacity')) s['fill-opacity'] = num(cur.fill_opacity, 'fill-opacity');
  if (want.has('stroke-opacity')) s['stroke-opacity'] = num(cur.stroke_opacity, 'stroke-opacity');
  if (want.has('opacity')) s.opacity = num(cur.opacity, 'opacity');
  if (want.has('stroke-width') && cur.stroke_width != null) s['stroke-width'] = String(cur.stroke_width);
  if (want.has('stroke-align')) s['stroke-align'] = cur._visterasStrokeAlign || 'center';
  if (want.has('stroke-dasharray')) {
    const d = normalizeDash(cur.stroke_dasharray);
    s['stroke-dasharray'] = d === 'none' ? null : d;
  }
  if (want.has('stroke-linecap')) s['stroke-linecap'] = isDefault('stroke-linecap', cur.stroke_linecap) ? null : cur.stroke_linecap;
  if (want.has('stroke-linejoin')) s['stroke-linejoin'] = isDefault('stroke-linejoin', cur.stroke_linejoin) ? null : cur.stroke_linejoin;
  return s;
}

// ─── Hit-testing ─────────────────────────────────────────────────────────────
const EXCLUDE_ANCESTORS = '#selectorParentGroup, #canvasBackground, defs, clipPath, mask, marker, pattern, symbol, [data-visteras-overlay]';

const num0 = (v, d = 1) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };

/** Product of `opacity` from el up to (not including) `stop`; 0 ⇒ invisible. */
export function effectiveOpacity(el, getCS, stop = null) {
  let o = 1;
  for (let n = el; n && n !== stop && n.nodeType === 1; n = n.parentNode) {
    o *= num0(getCS(n)?.opacity, 1);
    if (o <= 0) return 0;
    if (n.nodeName === 'svg' && n.id === 'svgcontent') break;
  }
  return o;
}

/** Is this fill/stroke actually painted (not none/transparent, opacity > 0)? */
export function isPaintPainted(cs, which) {
  if (!cs) return false;
  const get = (p) => (typeof cs.getPropertyValue === 'function' ? cs.getPropertyValue(p) : cs[p]);
  const raw = get(which);
  if (raw == null || String(raw).trim() === '') return false;
  const p = parseCssPaint(raw);
  if (p ? p.none : /^\s*none\s*$/i.test(String(raw))) return false; // unknown syntax (named colour…) ⇒ painted
  if (num0(get(`${which}-opacity`), 1) <= 0) return false;
  if (which === 'stroke' && num0(get('stroke-width'), 1) <= 0) return false;
  return true;
}

/** Client point → element-local SVGPoint (Chromium needs an SVGPoint). */
export function localPoint(el, clientX, clientY) {
  const ctm = el?.getScreenCTM?.();
  if (!ctm) return null;
  const inv = ctm.inverse();
  const x = inv.a * clientX + inv.c * clientY + inv.e;
  const y = inv.b * clientX + inv.d * clientY + inv.f;
  let pt = el.ownerSVGElement?.createSVGPoint?.();
  if (pt) { pt.x = x; pt.y = y; } else pt = typeof DOMPoint === 'function' ? new DOMPoint(x, y) : { x, y };
  return pt;
}

function findHelperFor(body) {
  if (!body?.id) return null;
  for (const c of body.parentNode?.children || []) {
    if (c !== body && c.getAttribute?.(STROKE_HELPER_FOR_ATTR) === body.id) return c;
  }
  try { return (body.ownerSVGElement || body.ownerDocument)?.querySelector?.(`[${STROKE_HELPER_FOR_ATTR}="${CSS.escape(body.id)}"]`) || null; } catch { return null; }
}

/**
 * Illustrator-style hit test: does the pointer hit a PAINTED area of `el`?
 * An unfilled (none / transparent / fill-opacity 0) interior is not a hit;
 * only a painted stroke is. For Inside/Outside stroked bodies the visible ring
 * is the helper's stroke (clipped to the inside / masked to the outside).
 * Images and text count within what the browser hit-tested.
 * @param {Element} el body (not a helper)
 * @param {{ getCS?: Function, helper?: Element|null }} [opts]
 */
export function isPaintedHit(el, clientX, clientY, opts = {}) {
  const getCS = opts.getCS || ((e) => getComputedStyle(e));
  if (!el) return false;
  const content = opts.content || el.ownerDocument?.getElementById?.('svgcontent') || null;
  if (effectiveOpacity(el, getCS, content) <= 0) return false;
  if (el.nodeName === 'image' || el.nodeName === 'text') return true;
  if (typeof el.isPointInFill !== 'function') return true; // not geometry: trust the browser
  const cs = getCS(el);
  const pt = localPoint(el, clientX, clientY);
  if (!pt) return true;
  const inFill = (() => { try { return !!el.isPointInFill(pt); } catch { return false; } })();
  if (isPaintPainted(cs, 'fill') && inFill) return true;
  const align = String(el.getAttribute?.(STROKE_ALIGN_ATTR) || 'center').toLowerCase();
  const helper = align === 'center' ? null : ('helper' in opts ? opts.helper : findHelperFor(el));
  if (helper && typeof helper.isPointInStroke === 'function') {
    const hcs = getCS(helper);
    if (!isPaintPainted(hcs, 'stroke') || effectiveOpacity(helper, getCS, content) <= 0) return false;
    const hp = localPoint(helper, clientX, clientY) || pt;
    let onRing = false;
    try { onRing = !!helper.isPointInStroke(hp); } catch { onRing = false; }
    if (!onRing) return false;
    // Inside ring is clipped to the body; outside ring is masked off the body.
    return align === 'inside' ? inFill : (align === 'outside' ? !inFill : true);
  }
  if (!isPaintPainted(cs, 'stroke')) return false;
  try { return !!el.isPointInStroke?.(pt); } catch { return false; }
}

/**
 * Topmost painted leaf under the pointer inside #svgcontent (never the
 * selection chrome, background, defs or hidden elements). Unpainted areas
 * (e.g. the interior of an unfilled path) pass through to what's below.
 */
export function pickTargetAt(clientX, clientY, api = null, opts = {}) {
  const content = document.getElementById('svgcontent');
  if (!content) return null;
  const list = document.elementsFromPoint(clientX, clientY) || [];
  const tried = new Set();
  for (const hit of list) {
    if (hit === content || !content.contains(hit)) continue;
    if (hit.closest?.(EXCLUDE_ANCESTORS)) continue;
    let el = hit;
    if (el.nodeName === 'tspan' || el.nodeName === 'textPath') el = el.closest('text');
    if (!el) continue;
    el = resolveBody(el, api);
    if (!el || isStrokeHelper(el) || tried.has(el)) continue;
    tried.add(el);
    if (!LEAF_TAGS.has(el.nodeName) && !(opts.images && el.nodeName === 'image')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') continue;
    if (!isPaintedHit(el, clientX, clientY, { content })) continue;
    return el;
  }
  return null;
}

/**
 * Solid paint of a vector shape at a screen point (stroke wins over fill, as
 * it is painted on top). Used when the rendered pixel can't be read.
 * @returns {string|null} "#rrggbb"
 */
export function solidPaintAt(el, clientX, clientY, getCS = (e) => getComputedStyle(e)) {
  if (!el || el.nodeName === 'image') return null;
  const cs = getCS(el);
  const paintOf = (prop) => {
    const v = normalizePaint(cs?.getPropertyValue?.(prop));
    return v && /^#[0-9a-f]{6}$/.test(v) ? v : (v && /^#[0-9a-f]{3}$/.test(v) ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : null);
  };
  let onStroke = false;
  let onFill = true;
  const ctm = el.getScreenCTM?.();
  if (ctm && typeof el.isPointInFill === 'function') {
    const inv = ctm.inverse();
    const x = inv.a * clientX + inv.c * clientY + inv.e;
    const y = inv.b * clientX + inv.d * clientY + inv.f;
    // Chromium still requires an SVGPoint here (DOMPoint throws a TypeError).
    let pt = el.ownerSVGElement?.createSVGPoint?.();
    if (pt) { pt.x = x; pt.y = y; } else pt = typeof DOMPoint === 'function' ? new DOMPoint(x, y) : { x, y };
    try { onStroke = !!el.isPointInStroke?.(pt); } catch { onStroke = false; }
    try { onFill = !!el.isPointInFill(pt); } catch { onFill = true; }
  }
  return (onStroke && paintOf('stroke')) || (onFill && paintOf('fill')) || null;
}

let _toastTimer = null;
function toast(msg, ms = 3200) {
  let el = document.getElementById('visteras_eyedropper_toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'visteras_eyedropper_toast';
    el.style.cssText = [
      'position:fixed', 'bottom:48px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:99999', 'padding:6px 12px', 'background:#1e1e1e', 'color:#fa7c1b',
      'border:1px solid #fa7c1b', 'border-radius:4px', 'font-size:11px',
      'font-weight:600', 'box-shadow:0 4px 16px rgba(0,0,0,0.5)', 'pointer-events:none',
      'max-width:70vw', 'text-align:center',
    ].join(';');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.style.display = 'none'; }, ms);
}

// ─── Options panel ───────────────────────────────────────────────────────────
function _buildOptionsPanel() {
  if (document.getElementById('visteras-eyedropper-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'visteras-eyedropper-panel';
  panel.style.cssText = 'display:none;padding:10px 12px;border-top:1px solid rgba(255,255,255,0.08);font:12px/1.5 -apple-system,sans-serif;color:#ccc';

  const title = document.createElement('div');
  title.style.cssText = 'font-weight:600;color:#fff;margin-bottom:8px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em';
  title.textContent = 'Eyedropper Options';
  panel.appendChild(title);

  const ROWS = [
    { key: 'sampleFill',       label: 'Sample Fill' },
    { key: 'sampleStroke',     label: 'Sample Stroke' },
    { key: 'sampleStrokeWidth',label: 'Sample Stroke Weight' },
    { key: 'sampleStrokeAlign',label: 'Sample Stroke Align' },
    { key: 'sampleOpacity',    label: 'Sample Opacity' },
    { key: 'sampleStrokeDash', label: 'Sample Dash Array' },
    { key: 'sampleStrokeCaps', label: 'Sample Line Caps/Joins' },
    { key: 'sampleMiter',      label: 'Sample Miter Limit' },
    { key: 'sampleBlend',      label: 'Sample Blend Mode' },
    null, // divider
    { key: 'applyFill',        label: 'Apply Fill' },
    { key: 'applyStroke',      label: 'Apply Stroke' },
    { key: 'applyStrokeWidth', label: 'Apply Stroke Weight' },
    { key: 'applyStrokeAlign', label: 'Apply Stroke Align' },
    { key: 'applyOpacity',     label: 'Apply Opacity' },
    { key: 'applyStrokeDash',  label: 'Apply Dash Array' },
    { key: 'applyStrokeCaps',  label: 'Apply Line Caps/Joins' },
    { key: 'applyMiter',       label: 'Apply Miter Limit' },
    { key: 'applyBlend',       label: 'Apply Blend Mode' },
  ];

  for (const row of ROWS) {
    if (row === null) {
      const div = document.createElement('div');
      div.style.cssText = 'border-top:1px solid rgba(255,255,255,0.08);margin:6px 0';
      panel.appendChild(div);
      continue;
    }
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:7px;cursor:pointer;margin-bottom:4px;user-select:none';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = _options[row.key] !== false;
    cb.style.cssText = 'accent-color:#7cb9ff;width:13px;height:13px;margin:0;cursor:pointer';
    cb.addEventListener('change', () => {
      _options[row.key] = cb.checked;
      _saveOptions();
    });
    const span = document.createElement('span');
    span.textContent = row.label;
    label.appendChild(cb);
    label.appendChild(span);
    panel.appendChild(label);
  }

  // Inject after the colour-system panel or at end of sidepanels
  const sidepanels = document.getElementById('sidepanels');
  if (sidepanels) sidepanels.appendChild(panel);
}

function _showOptionsPanel(show) {
  const panel = document.getElementById('visteras-eyedropper-panel');
  if (panel) panel.style.display = show ? 'block' : 'none';
}

// ─── Cursor + toolbar ────────────────────────────────────────────────────────
function _injectCursorStyle() {
  if (document.getElementById('visteras-eyedropper-cursor-style')) return;
  const style = document.createElement('style');
  style.id = 'visteras-eyedropper-cursor-style';
  // Same cursor + hotspot as Studio's pick_color tool.
  style.textContent = `
    body[data-mode="${MODE}"] #svgcanvas,
    body[data-mode="${MODE}"] #svgcanvas * {
      cursor: url('images/cursor-eyedropper.svg') 2 22, crosshair !important;
    }
  `;
  document.head.appendChild(style);
}

function _injectToolbarButton(editor) {
  if (document.getElementById('tool_eyedropper')) return;
  const toolsLeft = document.getElementById('tools_left');
  if (!toolsLeft) return;
  const btn = document.createElement('se-button');
  btn.id = 'tool_eyedropper';
  btn.setAttribute('title', 'Eyedropper Tool (I)');
  btn.setAttribute('src', 'eye_dropper.svg');
  btn.addEventListener('click', () => {
    if (editor.leftPanel?.updateLeftPanel?.('tool_eyedropper') === false) return;
    editor.svgCanvas.setMode(MODE);
  });
  const anchor = document.getElementById('tool_image') || document.getElementById('tools_swatch_sep');
  if (anchor?.parentNode === toolsLeft) toolsLeft.insertBefore(btn, anchor);
  else toolsLeft.appendChild(btn);
}

function isTyping() {
  const a = document.activeElement;
  return !!(window.__visterasIsTypingDirectly || a?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(a?.nodeName));
}

// ─── Main mount ──────────────────────────────────────────────────────────────
/**
 * @param {object} editor - The SVG-Edit Editor instance.
 */
export function mountEyedropperTool(editor) {
  if (window.__visterasEyedropperMounted) return;
  window.__visterasEyedropperMounted = true;
  _loadOptions();
  _injectCursorStyle();
  _injectToolbarButton(editor);
  _buildOptionsPanel();

  const sc = editor.svgCanvas;
  const history = {
    ChangeElementCommand: sc.history.ChangeElementCommand,
    BatchCommand: sc.history.BatchCommand,
    undoMgr: sc.undoMgr,
  };
  const api = () => window.__visterasColorSystem || null;
  const env = () => ({ api: api(), sc });
  const selection = () => (sc.getSelectedElements?.() || []).filter((el) => el && el.isConnected !== false);

  const afterApply = (elems) => {
    try { sc.call('changed', elems); } catch { /* ignore */ }
    window.__updatePropertiesVisibility?.();
    window.__visterasUpdateSwatches?.();
    try { api()?.syncFromCanvas?.(); } catch { /* ignore */ }
  };

  /** No selection: load the sampled appearance as the current defaults. */
  const loadDefaults = (style) => {
    const ctrl = api();
    const prevTarget = ctrl?.getActiveTarget?.();
    for (const t of ['fill', 'stroke']) {
      if (!(t in style) || style[t] == null) continue;
      const v = style[t];
      sc.setCurShape?.(t, v);
      if (sc.curProperties) sc.curProperties[t] = v;
      if (/^#[0-9a-f]{3,6}$/i.test(v) || v === 'none') {
        sc.setCurProperties?.(`${t}_paint`, { type: 'solidColor' });
        if (ctrl) {
          ctrl.setActiveTarget(t, { syncColor: false });
          // apply:false — nothing is selected; we set the defaults ourselves so
          // a stale path object can never be painted by accident.
          ctrl.setWorkingColor(v, { apply: false });
          if (v !== 'none') ctrl.pushRecent?.(v);
        }
      }
    }
    if (ctrl && prevTarget) ctrl.setActiveTarget(prevTarget, { syncColor: false });
    if (style['stroke-width'] != null) {
      const w = Number(style['stroke-width']);
      if (Number.isFinite(w)) {
        sc.setStrokeWidth?.(w);
        const input = document.getElementById('stroke_width');
        if (input) input.value = String(w);
      }
    }
    if ('fill-opacity' in style) sc.setPaintOpacity?.('fill', Number(style['fill-opacity'] ?? 1), true);
    if ('stroke-opacity' in style) sc.setPaintOpacity?.('stroke', Number(style['stroke-opacity'] ?? 1), true);
    if ('opacity' in style) sc.setCurShape?.('opacity', Number(style.opacity ?? 1));
    if ('stroke-dasharray' in style) sc.setCurShape?.('stroke_dasharray', style['stroke-dasharray'] ?? 'none');
    if ('stroke-linecap' in style) sc.setCurShape?.('stroke_linecap', style['stroke-linecap'] ?? 'butt');
    if ('stroke-linejoin' in style) sc.setCurShape?.('stroke_linejoin', style['stroke-linejoin'] ?? 'miter');
    if ('stroke-align' in style && sc.curShape) sc.curShape._visterasStrokeAlign = style['stroke-align'] || 'center';
    try { editor.bottomPanel?.updateColorpickers?.(true); } catch { /* ignore */ }
    window.__visterasUpdateSwatches?.();
    try { ctrl?.syncFromCanvas?.(); } catch { /* ignore */ }
  };

  const firstLeaf = (els) => expandTargets(els, api())[0] || null;

  // Undo/redo keep the selection that was active when the eyedropper applied
  // (toolbar undo repopulates layers and clears it, like Shape Builder).
  const keepSelection = (els) => () => setTimeout(() => {
    const live = els.filter((el) => el?.isConnected);
    try {
      sc.clearSelection();
      if (live.length) sc.addToSelection(live, true);
      afterApply(live);
    } catch { /* ignore */ }
  }, 0);

  // ── Raster sampling ───────────────────────────────────────────────────────
  const sampler = createImageSampler();
  window.__visterasEyedropperSampler = sampler; // for smoke/debug

  /**
   * Apply a sampled pixel colour. fromImage (plain click on a raster <image>):
   * fill = colour + stroke = none. Otherwise (Shift-click): active well only.
   */
  const applySampledColor = (hex, fromImage = false) => {
    if (!hex) return; // transparent pixel: no-op
    const ctrl = api();
    const well = ctrl?.getActiveTarget?.() === 'stroke' ? 'stroke' : 'fill';
    const sel = selection();
    const style = pixelSampleStyle(hex, { fromImage, well });
    if (sel.length && expandTargets(sel, api()).length) {
      // Dropping stroke-align unwraps the body; a selected wrap <g> would be
      // left disconnected, so reselect its body instead.
      const bodyOf = new Map(sel.map((el) => [el, resolveBody(el, api())]));
      const cmd = applyStyleToElements(sel, style, history, {
        ...env(), ignoreOptions: true, dropStrokeAlign: fromImage, name: 'Eyedropper Sample',
        afterHistory: keepSelection(sel.map((el) => bodyOf.get(el) || el).filter((el, i, a) => a.indexOf(el) === i)),
      });
      const now = sel.map((el) => (el.isConnected ? el : bodyOf.get(el))).filter((el, i, a) => el?.isConnected && a.indexOf(el) === i);
      if (cmd) {
        if (now.length !== sel.length || now.some((el, i) => el !== sel[i])) {
          try { sc.clearSelection(); sc.addToSelection(now, true); } catch { /* ignore */ }
        }
        afterApply(now);
      }
      try { ctrl?.pushRecent?.(hex); ctrl?.emit?.(); } catch { /* ignore */ }
    } else {
      loadDefaults(style);
    }
    window.__visterasLastEyedropperSample = { hex, well: fromImage ? 'fill+stroke:none' : well, selection: sel.length };
  };

  let sampling = null; // in-flight pixel sample (one at a time)
  const pixelSample = (e, hit) => {
    const { clientX, clientY, shiftKey } = e;
    const content = document.getElementById('svgcontent');
    const primary = shiftKey
      ? () => sampleRenderedAt(content, clientX, clientY, sampler)
      : () => sampleImageElementAt(hit, clientX, clientY, sampler);
    const fallback = async () => {
      if (!hit) return null;
      if (hit.nodeName !== 'image') return solidPaintAt(hit, clientX, clientY);
      if (!shiftKey) return null; // the image itself failed
      const r = await sampleImageElementAt(hit, clientX, clientY, sampler);
      return r?.hex || null;
    };
    const run = sampleWithFallback(primary, { fallback, toast, onError: (err) => console.warn('[eyedropper]', err) })
      .then((r) => { if (r) applySampledColor(r.hex, !shiftKey && hit?.nodeName === 'image'); return r; })
      .finally(() => { if (sampling === run) sampling = null; });
    sampling = run;
    window.__visterasEyedropperPending = run;
    return run;
  };

  const preloadImages = () => {
    const content = document.getElementById('svgcontent');
    content?.querySelectorAll('image').forEach((img) => {
      const href = imageHref(img);
      if (href) sampler.load(href, imageGeometry(img)).catch(() => { /* reported on click */ });
    });
  };

  const handleClick = (e) => {
    if (sampling) return; // previous pixel sample still resolving
    const hit = pickTargetAt(e.clientX, e.clientY, api(), { images: true });
    if (e.shiftKey && !e.altKey) {
      if (!hit) return; // empty canvas: no-op
      pixelSample(e, hit);
      return;
    }
    if (hit?.nodeName === 'image' && !e.altKey) {
      pixelSample(e, hit);
      return;
    }
    const target = hit?.nodeName === 'image' ? null : hit;
    if (!target) return; // empty canvas: no-op
    const sel = selection();
    if (e.altKey) {
      // Option-click: current selection appearance (or defaults) → clicked.
      const src = sel.length ? firstLeaf(sel) : null;
      const style = src ? sampleStyleFrom(src, env()) : styleFromCurShape(sc.curShape || {});
      if (applyStyleToElements([target], style, history, { ...env(), afterHistory: keepSelection(sel) })) afterApply([target]);
      return;
    }
    const style = sampleStyleFrom(target, env());
    if (!Object.keys(style).length) return;
    if (sel.length) {
      if (applyStyleToElements(sel, style, history, { ...env(), afterHistory: keepSelection(sel) })) afterApply(sel);
    } else {
      loadDefaults(style);
    }
  };

  // Own the gesture: capture before SVG-Edit's canvas handlers (which would
  // start a rubber-band / clear the selection).
  let ownPointer = false;
  let mouseDown = false;
  window.addEventListener('mousedown', (e) => {
    mouseDown = true;
    if (sc.getMode() !== MODE || e.button !== 0 || sc.spaceKey) return;
    if (!e.target?.closest?.('#svgcanvas')) return;
    ownPointer = true;
    e.preventDefault();
    e.stopImmediatePropagation();
    handleClick(e);
  }, true);
  const swallow = (e) => {
    if (!ownPointer) return;
    e.stopImmediatePropagation();
    if (e.type === 'mouseup') ownPointer = false;
  };
  window.addEventListener('mousemove', swallow, true);
  window.addEventListener('mouseup', (e) => {
    mouseDown = false;
    swallow(e);
    if (pendingRestore && !e.metaKey && !e.ctrlKey) restoreEyedropper();
  }, true);

  // ── Cmd/Ctrl: temporary selection tool (Studio handle_alt_eyedropper) ────
  let lastSelectTool = 'tool_select';
  let tempTool = false;
  let pendingRestore = false;
  const SELECT_MODES = new Set(['select', 'pathedit', 'multiselect', 'resize', 'rotate']);
  const restoreEyedropper = () => {
    pendingRestore = false;
    if (!tempTool) return;
    tempTool = false;
    if (SELECT_MODES.has(sc.getMode())) document.getElementById('tool_eyedropper')?.click();
  };
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Meta' && e.key !== 'Control') return;
    if (tempTool || sc.getMode() !== MODE || isTyping() || mouseDown) return;
    tempTool = true;
    document.getElementById(lastSelectTool)?.click();
  }, true);
  window.addEventListener('keyup', (e) => {
    if (!tempTool || (e.key !== 'Meta' && e.key !== 'Control')) return;
    if (mouseDown) pendingRestore = true;
    else restoreEyedropper();
  }, true);
  window.addEventListener('blur', () => { if (tempTool) restoreEyedropper(); });

  // ── Mode changes ──────────────────────────────────────────────────────────
  document.addEventListener('modeChange', () => {
    const mode = sc.getMode();
    const active = mode === MODE;
    _showOptionsPanel(active);
    if (active) preloadImages();
    if (mode === 'select') {
      lastSelectTool = document.getElementById('tool_direct_select')?.pressed ? 'tool_direct_select' : 'tool_select';
    } else if (mode === 'pathedit') {
      lastSelectTool = 'tool_direct_select';
    }
    if (tempTool && !active && !SELECT_MODES.has(mode)) { tempTool = false; pendingRestore = false; }
  });

  // ── Escape: back to Select ────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sc.getMode() === MODE) editor.leftPanel?.clickSelect?.();
  });
}

export default mountEyedropperTool;
