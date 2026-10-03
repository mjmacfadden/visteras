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

/**
 * Illustrator dialog defaults: Drop Shadow (Multiply, 75 %, 7/7, blur 5, Color black /
 * Darkness 100 %), Inner Glow (Screen, 75 %, white, blur 5, Edge), Outer Glow (Screen,
 * 75 %, white, blur 5), Feather (5). Inner Shadow is legacy: no menu entry, but files
 * that have one keep rendering and editing it.
 */
export const FX_DEFAULTS = {
  dropShadow: { enabled: true, mode: 'multiply', opacity: 75, x: 7, y: 7, blur: 5, color: '#000000', colorMode: 'color', darkness: 100 },
  innerShadow: { enabled: true, mode: 'multiply', opacity: 75, x: 4, y: 4, blur: 5, color: '#000000' },
  innerGlow: { enabled: true, mode: 'screen', opacity: 75, blur: 5, color: '#ffffff', position: 'edge' },
  outerGlow: { enabled: true, mode: 'screen', opacity: 75, blur: 5, color: '#ffffff' },
  feather: { enabled: true, radius: 5 },
  colorAdjust: { enabled: true, brightness: 0, contrast: 0, saturation: 0, hue: 0 },
  gaussianBlur: { enabled: true, radius: 2 },
};
/** Render order: color → blur → feather → inside effects → outside effects (under the art). */
export const FX_ORDER = ['colorAdjust', 'gaussianBlur', 'feather', 'innerShadow', 'innerGlow', 'outerGlow', 'dropShadow'];
export const FX_LABELS = { dropShadow: 'Drop Shadow', innerShadow: 'Inner Shadow', innerGlow: 'Inner Glow', outerGlow: 'Outer Glow', feather: 'Feather', colorAdjust: 'Color Adjust', gaussianBlur: 'Gaussian Blur' };
/** Types offered in menus (Inner Shadow is legacy). */
export const LEGACY_TYPES = ['innerShadow'];
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
  if (type === 'feather') return { enabled, radius: num(raw.radius, d.radius, 0, 250) };
  const mode = SHADOW_MODES.includes(raw.mode) ? raw.mode : d.mode;
  const opacity = num(raw.opacity, d.opacity, 0, 100);
  const blur = num(raw.blur, d.blur, 0, 250);
  const color = hex(raw.color, d.color);
  if (type === 'outerGlow') return { enabled, mode, opacity, blur, color };
  if (type === 'innerGlow') return { enabled, mode, opacity, blur, color, position: raw.position === 'center' ? 'center' : 'edge' };
  const out = { enabled, mode, opacity, x: num(raw.x, d.x, -1000, 1000), y: num(raw.y, d.y, -1000, 1000), blur, color };
  if (type === 'dropShadow') { out.colorMode = raw.colorMode === 'darkness' ? 'darkness' : 'color'; out.darkness = num(raw.darkness, d.darkness, 0, 100); }
  return out;
}

/**
 * Rotation (degrees) of an element's own transform. Filters run in the element's user
 * space, so shadow offsets are counter-rotated to stay screen-relative like Illustrator.
 */
export function elementAngle(el) {
  try {
    const list = el?.transform?.baseVal;
    if (!list || !list.numberOfItems) return 0;
    const m = list.consolidate()?.matrix;
    if (!m) return 0;
    const a = Math.atan2(m.b, m.a) * 180 / Math.PI;
    return Math.abs(a) < 1e-6 ? 0 : r(a);
  } catch { return 0; }
}

/** Offset (x, y) expressed in a frame rotated by `angle` degrees (inverse rotation). */
export function localOffset(x, y, angle = 0) {
  if (!angle) return { x, y };
  const t = -angle * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  return { x: r(x * c - y * s), y: r(x * s + y * c) };
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
export function buildFilterPrimitives(fx, { angle = 0 } = {}) {
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
  // Feather: soften edges inward (blurred alpha remapped so the edge reaches 0).
  const fe = fx.feather;
  let alpha = 'SourceAlpha';
  if (fe?.enabled && fe.radius > 0) {
    out.push(['feGaussianBlur', { in: 'SourceAlpha', stdDeviation: String(r(fe.radius / 2)), result: 'vfxFeBlur' }]);
    out.push(['feComponentTransfer', { in: 'vfxFeBlur', result: 'vfxFeMask' }, [['feFuncA', { type: 'linear', slope: '2', intercept: '-1' }]]]);
    out.push(['feComposite', { in: cur, in2: 'vfxFeMask', operator: 'in', result: 'vfxFeather' }]);
    cur = 'vfxFeather';
    alpha = 'vfxFeather';
  }
  const is = fx.innerShadow;
  if (is?.enabled) {
    const o = localOffset(is.x, is.y, angle);
    out.push(['feFlood', { 'flood-color': is.color, 'flood-opacity': String(r(is.opacity / 100)), result: 'vfxIsFlood' }]);
    out.push(['feComposite', { in: 'vfxIsFlood', in2: 'SourceAlpha', operator: 'out', result: 'vfxIsOut' }]);
    out.push(['feOffset', { in: 'vfxIsOut', dx: String(o.x), dy: String(o.y), result: 'vfxIsOff' }]);
    out.push(['feGaussianBlur', { in: 'vfxIsOff', stdDeviation: String(r(is.blur / 2)), result: 'vfxIsBlur' }]);
    out.push(['feComposite', { in: 'vfxIsBlur', in2: 'SourceAlpha', operator: 'in', result: 'vfxIsIn' }]);
    out.push(['feBlend', { in: 'vfxIsIn', in2: cur, mode: is.mode, result: 'vfxInner' }]);
    cur = 'vfxInner';
  }
  // Inner Glow: Edge = glow from the outline inward; Center = glow from the middle out.
  // Its mode really blends (with the object's own pixels, which is all it covers).
  const ig = fx.innerGlow;
  if (ig?.enabled) {
    out.push(['feFlood', { 'flood-color': ig.color, 'flood-opacity': String(r(ig.opacity / 100)), result: 'vfxIgFlood' }]);
    if (ig.position === 'center') {
      out.push(['feGaussianBlur', { in: 'SourceAlpha', stdDeviation: String(r(ig.blur / 2)), result: 'vfxIgBlur' }]);
      out.push(['feComposite', { in: 'vfxIgFlood', in2: 'vfxIgBlur', operator: 'in', result: 'vfxIgMask' }]);
    } else {
      out.push(['feComposite', { in: 'vfxIgFlood', in2: 'SourceAlpha', operator: 'out', result: 'vfxIgOut' }]);
      out.push(['feGaussianBlur', { in: 'vfxIgOut', stdDeviation: String(r(ig.blur / 2)), result: 'vfxIgMask' }]);
    }
    out.push(['feComposite', { in: 'vfxIgMask', in2: alpha, operator: 'in', result: 'vfxIgIn' }]);
    out.push(['feBlend', { in: 'vfxIgIn', in2: cur, mode: ig.mode === 'normal' ? 'normal' : ig.mode, result: 'vfxInGlow' }]);
    out.push(['feComposite', { in: 'vfxInGlow', in2: alpha, operator: 'in', result: 'vfxInGlowIn' }]);
    cur = 'vfxInGlowIn';
  }
  // Outside effects are merged under the art. Their blend mode cannot reach the
  // backdrop (SVG filters have no BackgroundImage in browsers): stored, composited Normal.
  const under = [];
  const og = fx.outerGlow;
  if (og?.enabled) {
    out.push(['feGaussianBlur', { in: alpha, stdDeviation: String(r(og.blur / 2)), result: 'vfxOgBlur' }]);
    out.push(['feFlood', { 'flood-color': og.color, 'flood-opacity': String(r(og.opacity / 100)), result: 'vfxOgFlood' }]);
    out.push(['feComposite', { in: 'vfxOgFlood', in2: 'vfxOgBlur', operator: 'in', result: 'vfxOg' }]);
    under.push('vfxOg');
  }
  const ds = fx.dropShadow;
  if (ds?.enabled) {
    const o = localOffset(ds.x, ds.y, angle);
    if (ds.colorMode === 'darkness') {
      // Darkness: the object's own colors darkened by darkness % (100 % = black).
      const k = String(r(1 - ds.darkness / 100)), a = String(r(ds.opacity / 100));
      out.push(['feGaussianBlur', { in: cur, stdDeviation: String(r(ds.blur / 2)), result: 'vfxDsBlur' }]);
      out.push(['feOffset', { in: 'vfxDsBlur', dx: String(o.x), dy: String(o.y), result: 'vfxDsOff' }]);
      out.push(['feColorMatrix', { in: 'vfxDsOff', type: 'matrix', values: `${k} 0 0 0 0 0 ${k} 0 0 0 0 0 ${k} 0 0 0 0 0 ${a} 0`, result: 'vfxDs' }]);
    } else {
      out.push(['feGaussianBlur', { in: alpha, stdDeviation: String(r(ds.blur / 2)), result: 'vfxDsBlur' }]);
      out.push(['feOffset', { in: 'vfxDsBlur', dx: String(o.x), dy: String(o.y), result: 'vfxDsOff' }]);
      out.push(['feFlood', { 'flood-color': ds.color, 'flood-opacity': String(r(ds.opacity / 100)), result: 'vfxDsFlood' }]);
      out.push(['feComposite', { in: 'vfxDsFlood', in2: 'vfxDsOff', operator: 'in', result: 'vfxDs' }]);
    }
    under.unshift('vfxDs');
  }
  if (under.length) out.push(['feMerge', { result: 'vfxOut' }, [...under, cur].map((i) => ['feMergeNode', { in: i }])]);
  return out;
}

/** Extra room around the bbox so shadows/blur are not clipped. */
export function filterPadding(fx) {
  let pad = 4;
  for (const t of ['dropShadow', 'innerShadow']) {
    const e = fx[t];
    // hypot covers any counter-rotation of the offset
    if (e?.enabled) pad = Math.max(pad, Math.hypot(e.x, e.y) + e.blur * 1.5 + 4);
  }
  if (fx.outerGlow?.enabled) pad = Math.max(pad, fx.outerGlow.blur * 1.5 + 4);
  if (fx.gaussianBlur?.enabled) pad = Math.max(pad, fx.gaussianBlur.radius * 1.5 + 4);
  return Math.ceil(pad);
}

/**
 * Painted extent of an object's effects, in its own user space. `bbox` is the
 * object's (stroked) box; Gaussian blur reaches ~3σ = 1.5 × the Illustrator blur
 * value. Inner shadow stays inside the shape. Pure (used by export scopes).
 */
export function visualBounds(fx, bbox, { angle = 0 } = {}) {
  const b = bbox || { x: 0, y: 0, width: 0, height: 0 };
  let x0 = b.x, y0 = b.y, x1 = b.x + b.width, y1 = b.y + b.height;
  const gb = fx?.gaussianBlur;
  const gs = gb?.enabled && gb.radius > 0 ? gb.radius * 1.5 : 0;
  if (gs) { x0 -= gs; y0 -= gs; x1 += gs; y1 += gs; }
  const og = fx?.outerGlow;
  if (og?.enabled) {
    const g = og.blur * 1.5 + gs;
    x0 = Math.min(x0, b.x - g); y0 = Math.min(y0, b.y - g); x1 = Math.max(x1, b.x + b.width + g); y1 = Math.max(y1, b.y + b.height + g);
  }
  const ds = fx?.dropShadow;
  if (ds?.enabled) {
    const spread = ds.blur * 1.5 + gs;
    const o = localOffset(ds.x, ds.y, angle);
    x0 = Math.min(x0, b.x + o.x - spread); y0 = Math.min(y0, b.y + o.y - spread);
    x1 = Math.max(x1, b.x + b.width + o.x + spread); y1 = Math.max(y1, b.y + b.height + o.y + spread);
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
    const v = visualBounds(fx, local, { angle: elementAngle(owner) });
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
export const filterSignature = (fx, region, opts = {}) => JSON.stringify([buildFilterPrimitives(fx, opts), region]);

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
  const opts = { angle: elementAngle(el) };
  const sig = filterSignature(fx, region, opts);
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
  filter.replaceChildren(...buildFilterPrimitives(fx, opts).map((p) => makePrimitive(doc, p)));
  if (filter.parentNode !== defs) defs.append(filter);
  return filter;
}

/**
 * SVG-Edit's old Blur control wrote `filter="url(#<id>_blur)"` with a single
 * feGaussianBlur. Fold any such filter into the Gaussian Blur effect (radius = 2σ) so
 * it shows and edits in Effects; drop the old filter once nothing references it.
 * Not recorded in history (load-time migration). Returns the migrated elements.
 */
export function migrateLegacyBlur(content) {
  const done = [];
  if (!content) return done;
  for (const el of content.querySelectorAll('[filter]')) {
    if (el.closest('defs') || el.hasAttribute(FX_ATTR) || !el.id) continue;
    const id = referencedFilterId(el);
    if (!id || id.startsWith(FX_PREFIX)) continue;
    const f = el.ownerDocument.getElementById(id);
    if (!f || f.tagName.toLowerCase() !== 'filter') continue;
    const kids = [...f.children];
    if (kids.length !== 1 || kids[0].tagName !== 'feGaussianBlur') continue;
    const sd = Number(kids[0].getAttribute('stdDeviation'));
    if (!Number.isFinite(sd) || sd <= 0) continue;
    el.setAttribute(FX_ATTR, serializeFx({ gaussianBlur: { enabled: true, radius: r(sd * 2) } }));
    el.setAttribute('filter', filterRef(filterIdFor(el)));
    done.push(el);
    if (![...content.querySelectorAll('[filter]')].some((n) => referencedFilterId(n) === id)) f.remove();
  }
  return done;
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

const SHADOW_FIELDS = [
  ['mode', 'Mode', 'mode'], ['opacity', 'Opacity', 'number', { min: 0, max: 100, step: 1, unit: '%' }],
  ['x', 'X Offset', 'number', { min: -1000, max: 1000, step: 1, unit: 'px' }], ['y', 'Y Offset', 'number', { min: -1000, max: 1000, step: 1, unit: 'px' }],
  ['blur', 'Blur', 'number', { min: 0, max: 250, step: 0.5, unit: 'px' }],
];
const GLOW_FIELDS = [
  ['mode', 'Mode', 'mode'], ['color', 'Color', 'color'], ['opacity', 'Opacity', 'number', { min: 0, max: 100, step: 1, unit: '%' }],
  ['blur', 'Blur', 'number', { min: 0, max: 250, step: 0.5, unit: 'px' }],
];
const FIELDS = {
  // Illustrator: (•) Color [swatch]   ( ) Darkness [100] %
  dropShadow: [...SHADOW_FIELDS, ['colorMode', '', 'colorOrDarkness']],
  innerShadow: [...SHADOW_FIELDS, ['color', 'Color', 'color']],
  innerGlow: [...GLOW_FIELDS, ['position', '', 'radio', { options: [['center', 'Center'], ['edge', 'Edge']] }]],
  outerGlow: GLOW_FIELDS,
  feather: [['radius', 'Feather Radius', 'number', { min: 0, max: 250, step: 0.5, unit: 'px' }]],
  colorAdjust: [
    ['brightness', 'Brightness', 'range', { min: -100, max: 100, step: 1 }], ['contrast', 'Contrast', 'range', { min: -100, max: 100, step: 1 }],
    ['saturation', 'Saturation', 'range', { min: -100, max: 100, step: 1 }], ['hue', 'Hue', 'range', { min: -180, max: 180, step: 1, unit: '°' }],
  ],
  gaussianBlur: [['radius', 'Radius', 'number', { min: 0, max: 250, step: 0.5, unit: 'px' }]],
};
/** Shown under Mode for effects drawn outside the art (see buildFilterPrimitives). */
const BACKDROP_NOTE = 'Mode is saved, but outside the object it previews as Normal: live SVG filters cannot blend with what is behind the object.';

export function summarizeEffect(type, e) {
  if (!e) return '';
  if (type === 'colorAdjust') return [['B', e.brightness], ['C', e.contrast], ['S', e.saturation], ['H', e.hue]].filter(([, v]) => v).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(' ') || 'No change';
  if (type === 'gaussianBlur' || type === 'feather') return `${e.radius}px`;
  if (type === 'innerGlow') return `${e.position === 'center' ? 'Center' : 'Edge'} · ${e.blur}px · ${e.opacity}%`;
  if (type === 'outerGlow') return `${e.blur}px · ${e.opacity}%`;
  if (type === 'dropShadow' && e.colorMode === 'darkness') return `${e.x}, ${e.y} · ${e.blur}px · ${e.opacity}% · Dark ${e.darkness}%`;
  return `${e.x}, ${e.y} · ${e.blur}px · ${e.opacity}%`;
}

/**
 * Effect menu (Illustrator structure). Rendered into the menu bar's Effect menu and
 * mirrored by the Properties fx button. Types without an implementation render disabled.
 */
export const EFFECT_MENU = [
  { id: 'action_effect_apply_last', label: 'Apply Last Effect', shortcut: '⇧⌘E', act: 'applyLast' },
  { id: 'action_effect_last', label: 'Last Effect…', shortcut: '⌥⇧⌘E', act: 'last' },
  { sep: true },
  { id: 'action_effect_raster_settings', label: 'Document Raster Effects Settings…', act: 'rasterSettings' },
  { sep: true },
  { header: 'Illustrator Effects' },
  { submenu: 'Stylize', id: 'stylize', items: ['dropShadow', 'innerGlow', 'outerGlow', 'feather'] },
  { submenu: 'SVG Filters', id: 'svg_filters', items: ['colorAdjust'] },
  { header: 'Photoshop Effects' },
  { submenu: 'Blur', id: 'blur', items: ['gaussianBlur'] },
];
const MENU_LABELS = { dropShadow: 'Drop Shadow…', innerGlow: 'Inner Glow…', outerGlow: 'Outer Glow…', feather: 'Feather…', colorAdjust: 'Color Adjust…', gaussianBlur: 'Gaussian Blur…' };

/** Menu HTML (menu-bar classes). `prefix` keeps ids unique between the menu bar and the fx popup. */
export function effectMenuHtml({ prefix = 'action_effect_', withLast = true } = {}) {
  const item = (type) => {
    const ok = !!FX_DEFAULTS[type];
    return `<div class="menu_dropdown_item${ok ? '' : ' disabled'}" role="menuitem" id="${prefix}${type}" data-fx-type="${type}"${ok ? '' : ' aria-disabled="true" title="Coming soon"'}>${MENU_LABELS[type] || type}</div>`;
  };
  // The fx popup mirrors the effect groups only (no Apply Last / raster settings).
  return EFFECT_MENU.filter((m) => withLast || m.header || m.submenu).map((m) => {
    if (m.sep) return '<div class="menu_dropdown_separator" role="separator"></div>';
    if (m.header) return `<div class="menu_dropdown_header" role="presentation">${m.header}</div>`;
    if (m.submenu) return `<div class="menu_dropdown_item menu_has_submenu" role="menuitem" aria-haspopup="true" id="${prefix}menu_${m.id}">${m.submenu}<span class="menu_submenu_arrow" aria-hidden="true">▶</span><div class="menu_dropdown_list menu_submenu_list" role="menu">${m.items.map(item).join('')}</div></div>`;
    const id = prefix === 'action_effect_' ? m.id : `${prefix}${m.id.replace('action_effect_', '')}`;
    return `<div class="menu_dropdown_item${m.disabled ? ' disabled' : ''}" role="menuitem" id="${id}"${m.act ? ` data-fx-act="${m.act}"` : ''}${m.disabled ? ` aria-disabled="true" title="${m.title}"` : ''}><span class="menu_label">${m.label}</span>${m.shortcut ? `<span class="menu_dropdown_shortcut">${m.shortcut}</span>` : ''}</div>`;
  }).join('');
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
  const syncNow = () => { try { migrateLegacyBlur(content()); syncAllFx(content(), defs()); } catch (e) { console.warn('[effects] sync failed', e); } };
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
    for (const opt of addSel.options || []) if (opt.value) opt.disabled = !!fx[opt.value];
    // SVG-Edit's Blur spinner is retired: blur lives in Effect ▸ Blur ▸ Gaussian Blur.
    if (blurSlot && !blurSlot.hidden) { blurSlot.hidden = true; blurSlot.style.display = 'none'; }
  };

  let lastEffect = null; // { type, values } — Apply Last Effect / Last Effect… (per session, like Illustrator)
  const edit = (type, { isNew = false, values = null } = {}) => {
    const els = targets();
    if (!els.length || !FX_DEFAULTS[type]) return;
    const originals = els.map((el) => ({ el, fx: el.getAttribute(FX_ATTR), filter: el.getAttribute('filter') }));
    const start = { ...(values || firstFx()[type] || FX_DEFAULTS[type]) };
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
      if (kind === 'mode') return `<label class="vfx_field"><span>${label}:</span><select data-key="${key}" class="vfx_select">${SHADOW_MODES.map((m) => `<option value="${m}"${m === v ? ' selected' : ''}>${modeLabel(m)}</option>`).join('')}</select></label>${type === 'dropShadow' || type === 'outerGlow' ? `<p class="vfx_note">${BACKDROP_NOTE}</p>` : ''}`;
      if (kind === 'radio') return `<div class="vfx_field vfx_radio">${o.options.map(([val, lab]) => `<label><input type="radio" name="vfx_r_${key}" data-key="${key}" value="${val}"${val === v ? ' checked' : ''}> ${lab}</label>`).join('')}</div>`;
      if (kind === 'colorOrDarkness') {
        const dark = start.colorMode === 'darkness';
        return `<div class="vfx_field vfx_radio vfx_color_dark">
          <label><input type="radio" name="vfx_r_colorMode" data-key="colorMode" value="color"${dark ? '' : ' checked'}> Color:</label><input type="color" data-key="color" value="${esc(start.color)}" aria-label="Shadow color"${dark ? ' disabled' : ''}>
          <label><input type="radio" name="vfx_r_colorMode" data-key="colorMode" value="darkness"${dark ? ' checked' : ''}> Darkness:</label><input type="number" class="vpara_input" data-key="darkness" min="0" max="100" step="1" value="${start.darkness ?? 100}" aria-label="Darkness"${dark ? '' : ' disabled'}><em>%</em></div>`;
      }
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
      for (const input of dlg.querySelectorAll('[data-key]')) {
        if (input.type === 'radio' && !input.checked) continue;
        v[input.dataset.key] = input.type === 'number' || input.type === 'range' ? Number(input.value) : input.value;
      }
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
      if (t.name === 'vfx_r_colorMode') { const dark = t.value === 'darkness'; dlg.querySelector('[data-key="color"]').disabled = dark; dlg.querySelector('[data-key="darkness"]').disabled = !dark; }
      if (t.dataset.mirror) { const r = dlg.querySelector(`[data-key="${t.dataset.mirror}"]`); if (r) r.value = t.value; }
      else if (t.type === 'range') { const m = dlg.querySelector(`[data-mirror="${t.dataset.key}"]`); if (m) m.value = t.value; }
      preview();
    });
    const close = (ok) => {
      const values = read();
      document.removeEventListener('keydown', onKey, true);
      overlay.remove(); dlg.remove();
      restore();
      if (ok) { applyFx(sc, els, mutateWith(values), `${isNew ? 'Add' : 'Edit'} ${FX_LABELS[type]}`); lastEffect = { type, values: normalizeEffect(type, values) }; }
      syncNow(); render(); renderMenus();
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
    dlg.querySelector('[data-key]:not([type="radio"])')?.focus();
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
  /* ── Effect menu (menu bar) + Properties fx button (mirror) ── */
  const openType = (type) => { if (!targets().length) return; edit(type, { isNew: !firstFx()[type] }); };
  const applyLast = () => {
    if (!lastEffect || !targets().length) return;
    const { type, values } = lastEffect;
    applyFx(sc, targets(), (fx) => ({ ...fx, [type]: normalizeEffect(type, values) }), `Apply ${FX_LABELS[type]}`);
    syncNow(); render();
  };
  const lastDialog = () => { if (lastEffect && targets().length) edit(lastEffect.type, { isNew: !firstFx()[lastEffect.type], values: lastEffect.values }); };
  const runItem = (node) => {
    if (!node || node.classList.contains('disabled')) return;
    if (node.dataset.fxType) openType(node.dataset.fxType);
    else if (node.dataset.fxAct === 'applyLast') applyLast();
    else if (node.dataset.fxAct === 'last') lastDialog();
    else if (node.dataset.fxAct === 'rasterSettings') window.__visterasExport?.openRasterSettings?.();
  };
  const menuList = document.getElementById('menu_effect_list');
  if (menuList) {
    menuList.innerHTML = effectMenuHtml();
    menuList.addEventListener('click', (e) => runItem(e.target.closest('[data-fx-type], [data-fx-act]')));
  }
  const fxBtn = addSel.tagName === 'BUTTON' ? addSel : null;
  let fxMenu = null;
  if (fxBtn) {
    fxMenu = document.createElement('div');
    fxMenu.id = 'vfx_fx_menu';
    fxMenu.className = 'menu_dropdown_list vmenu-root vmenu-popup';
    fxMenu.setAttribute('role', 'menu');
    fxMenu.setAttribute('aria-label', 'Add effect');
    fxMenu.innerHTML = effectMenuHtml({ prefix: 'vfx_menu_', withLast: false });
    document.body.append(fxMenu);
    const closeFx = () => { fxMenu.classList.remove('open'); fxBtn.setAttribute('aria-expanded', 'false'); for (const n of fxMenu.querySelectorAll('.submenu-open')) n.classList.remove('submenu-open'); };
    fxBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (fxMenu.classList.contains('open')) { closeFx(); return; }
      document.querySelectorAll('.menu_entry.open').forEach((m) => m.classList.remove('open'));
      const r = fxBtn.getBoundingClientRect();
      fxMenu.classList.add('open');
      fxBtn.setAttribute('aria-expanded', 'true');
      const w = fxMenu.offsetWidth, h = fxMenu.offsetHeight;
      fxMenu.style.left = `${Math.max(4, Math.min(window.innerWidth - w - 4, r.right - w))}px`;
      fxMenu.style.top = `${r.bottom + h + 4 > window.innerHeight ? Math.max(4, r.top - h - 2) : r.bottom + 2}px`;
    });
    fxMenu.addEventListener('click', (e) => { const n = e.target.closest('[data-fx-type]'); if (n && !n.classList.contains('disabled')) { closeFx(); runItem(n); } });
    document.addEventListener('click', (e) => { if (!fxMenu.contains(e.target)) closeFx(); });
  }
  function renderMenus() {
    const has = targets().length > 0;
    for (const n of document.querySelectorAll('#menu_effect_list [data-fx-type], #vfx_fx_menu [data-fx-type]')) n.classList.toggle('disabled', !has || !FX_DEFAULTS[n.dataset.fxType]);
    const ap = document.getElementById('action_effect_apply_last'), la = document.getElementById('action_effect_last');
    const label = lastEffect ? FX_LABELS[lastEffect.type] : null;
    if (ap) { ap.querySelector('.menu_label').textContent = label ? `Apply ${label}` : 'Apply Last Effect'; ap.classList.toggle('disabled', !label || !has); }
    if (la) { la.querySelector('.menu_label').textContent = label ? `${label}…` : 'Last Effect…'; la.classList.toggle('disabled', !label || !has); }
  }
  // ⇧⌘E Apply Last Effect · ⌥⇧⌘E Last Effect… (Illustrator)
  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.code !== 'KeyE') return;
    if (['input', 'textarea', 'select'].includes(document.activeElement?.tagName?.toLowerCase()) || document.querySelector('.vfx_dialog')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.altKey) lastDialog(); else applyLast();
  }, true);

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
    if (event === 'selected' || event === 'changed') { render(); renderMenus(); schedule(); }
    return result;
  };
  window.__visterasEffects = { edit, render, sync: syncNow, applyLast, lastDialog, lastEffect: () => lastEffect && { ...lastEffect }, getVisualBounds: (el) => getVisualBounds(el, sc) };
  renderMenus();
  syncNow();
  render();
  return window.__visterasEffects;
}
