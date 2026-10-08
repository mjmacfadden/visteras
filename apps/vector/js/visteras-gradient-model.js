/**
 * Visteras Vector — gradient model (pure maths, no DOM).
 *
 * Model (Illustrator semantics, in the object's local user units relative to its
 * bbox origin):
 *   { type: 'linear'|'radial', ox, oy, angle (deg, CCW like Illustrator),
 *     length (L), aspect (% — radial only), stops: [{ o: 0..1, c: '#rrggbb', a: 0..1, mid: 13..87 }] }
 * `mid` on stop i is the midpoint between stop i and i+1 (Illustrator default 50).
 *
 * SVG encoding: objectBoundingBox (gradientUnits omitted) + a per-object
 * gradientTransform so θ is exact in user space on non-square objects:
 *   linear  x1=ox y1=oy x2=ox+L y2=oy   gT = scale(1/w 1/h) rotate(-θ ox oy)
 *   radial  cx=fx=ox cy=fy=oy r=L       gT = scale(1/w 1/h) rotate(-θ ox oy)
 *                                            translate(ox oy) scale(1 A/100) translate(-ox -oy)
 * The net user-space map is  bbox.origin + R·p.
 */
export const GRADIENT_ATTR = 'data-visteras-gradient';
export const MID_STOP_ATTR = 'data-visteras-mid';
export const MIDPOINT_ATTR = 'data-visteras-midpoint';
export const MID_MIN = 13;
export const MID_MAX = 87;

const EPS = 1e-9;
const round = (n, d = 4) => { const f = 10 ** d; const v = Math.round(n * f) / f; return Object.is(v, -0) ? 0 : v; };
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/* ───────────── affine matrices {a,b,c,d,e,f} (SVG order) ───────────── */
export const IDENTITY = Object.freeze({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
export const mat = (a, b, c, d, e, f) => ({ a, b, c, d, e, f });
export function multiply(m, n) {
  return {
    a: m.a * n.a + m.c * n.b, b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d, d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e, f: m.b * n.e + m.d * n.f + m.f,
  };
}
export function invert(m) {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < EPS) return null;
  return { a: m.d / det, b: -m.b / det, c: -m.c / det, d: m.a / det, e: (m.c * m.f - m.d * m.e) / det, f: (m.b * m.e - m.a * m.f) / det };
}
export const apply = (m, p) => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });
export const applyVec = (m, v) => ({ x: m.a * v.x + m.c * v.y, y: m.b * v.x + m.d * v.y });
export const translate = (x, y = 0) => mat(1, 0, 0, 1, x, y);
export const scale = (x, y = x) => mat(x, 0, 0, y, 0, 0);
export function rotate(deg, cx = 0, cy = 0) {
  const r = deg * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
  return multiply(translate(cx, cy), multiply(mat(cos, sin, -sin, cos, 0, 0), translate(-cx, -cy)));
}

/** Parse an SVG transform list into one matrix. */
export function parseTransform(str) {
  let m = { ...IDENTITY };
  if (!str) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let t;
  while ((t = re.exec(String(str)))) {
    const n = t[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    let k = IDENTITY;
    switch (t[1]) {
      case 'matrix': if (n.length === 6) k = mat(...n); break;
      case 'translate': k = translate(n[0] || 0, n[1] || 0); break;
      case 'scale': k = scale(n[0] ?? 1, n[1] ?? n[0] ?? 1); break;
      case 'rotate': k = rotate(n[0] || 0, n[1] || 0, n[2] || 0); break;
      case 'skewX': k = mat(1, 0, Math.tan((n[0] || 0) * Math.PI / 180), 1, 0, 0); break;
      case 'skewY': k = mat(1, Math.tan((n[0] || 0) * Math.PI / 180), 0, 1, 0, 0); break;
      default: break;
    }
    m = multiply(m, k);
  }
  return m;
}
export const matrixToString = (m) => `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map((v) => round(v, 6)).join(' ')})`;

/* ───────────────────────────── colour ───────────────────────────── */
const NAMED = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500', gray: '#808080', grey: '#808080', transparent: '#000000' };
export function normalizeColor(v, fallback = '#000000') {
  if (v == null) return fallback;
  const s = String(v).trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return `#${m[1].split('').map((ch) => ch + ch).join('')}`;
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(s);
  if (m) return `#${[m[1], m[2], m[3]].map((x) => clamp(Math.round(Number(x)), 0, 255).toString(16).padStart(2, '0')).join('')}`;
  return NAMED[s] || fallback;
}
const rgb = (hex) => { const h = normalizeColor(hex); return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const toHex = (arr) => `#${arr.map((x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0')).join('')}`;
export const mixColor = (c1, c2, t) => { const a = rgb(c1), b = rgb(c2); return toHex(a.map((v, i) => v + (b[i] - v) * t)); };

/* ───────────────────────────── stops ───────────────────────────── */
export function normalizeStops(stops) {
  const list = (Array.isArray(stops) ? stops : []).map((s) => ({
    o: clamp(Number.isFinite(Number(s?.o)) ? Number(s.o) : 0, 0, 1),
    c: normalizeColor(s?.c),
    a: clamp(Number.isFinite(Number(s?.a)) ? Number(s.a) : 1, 0, 1),
    mid: clamp(Number.isFinite(Number(s?.mid)) ? Number(s.mid) : 50, MID_MIN, MID_MAX),
  }));
  list.sort((x, y) => x.o - y.o);
  if (list.length === 0) return [{ o: 0, c: '#ffffff', a: 1, mid: 50 }, { o: 1, c: '#000000', a: 1, mid: 50 }];
  if (list.length === 1) return [{ ...list[0], o: 0 }, { ...list[0], o: 1 }];
  return list;
}

/** Midpoint easing: f(u) = u^p with f(m) = 0.5. */
export const midExponent = (mid) => Math.log(0.5) / Math.log(clamp(mid, MID_MIN, MID_MAX) / 100);

/** Colour/opacity at offset o (honours midpoints). */
export function colorAt(stops, o) {
  const s = normalizeStops(stops);
  if (o <= s[0].o) return { c: s[0].c, a: s[0].a };
  const last = s[s.length - 1];
  if (o >= last.o) return { c: last.c, a: last.a };
  for (let i = 0; i < s.length - 1; i++) {
    const A = s[i], B = s[i + 1];
    if (o >= A.o && o <= B.o) {
      const u = B.o - A.o < EPS ? 0 : (o - A.o) / (B.o - A.o);
      const f = A.mid === 50 ? u : u ** midExponent(A.mid);
      return { c: mixColor(A.c, B.c, f), a: round(A.a + (B.a - A.a) * f) };
    }
  }
  return { c: last.c, a: last.a };
}

/**
 * SVG <stop> list. Each non-50 % midpoint becomes 3 interpolated stops at
 * u = ¼, ½, ¾ (marked synthetic), and the left stop records the midpoint.
 */
export function expandStops(stops) {
  const s = normalizeStops(stops);
  const out = [];
  s.forEach((st, i) => {
    const next = s[i + 1];
    const entry = { offset: round(st.o), color: st.c, opacity: round(st.a) };
    if (next && st.mid !== 50) entry.midpoint = round(st.mid, 2);
    out.push(entry);
    if (!next || st.mid === 50) return;
    const p = midExponent(st.mid);
    for (const u of [0.25, 0.5, 0.75]) {
      const f = u ** p;
      out.push({ offset: round(st.o + (next.o - st.o) * u), color: mixColor(st.c, next.c, f), opacity: round(st.a + (next.a - st.a) * f), synthetic: true });
    }
  });
  return out;
}

/** Inverse of expandStops: read <stop> specs, ignoring synthetic stops. */
export function readStops(specs) {
  const real = (specs || []).filter((s) => !s.synthetic);
  return normalizeStops(real.map((s) => ({ o: parseOffset(s.offset), c: s.color, a: s.opacity == null || s.opacity === '' ? 1 : Number(s.opacity), mid: s.midpoint == null || s.midpoint === '' ? 50 : Number(s.midpoint) })));
}

export function parseOffset(v) {
  if (v == null || v === '') return 0;
  const s = String(v).trim();
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return clamp(s.endsWith('%') ? n / 100 : n, 0, 1);
}

export function reverseStops(stops) {
  const s = normalizeStops(stops);
  const n = s.length;
  return normalizeStops(s.map((_, j) => {
    const orig = s[n - 1 - j];
    const seg = s[n - 2 - j]; // original segment that now follows this stop
    return { o: 1 - orig.o, c: orig.c, a: orig.a, mid: seg ? 100 - seg.mid : 50 };
  }));
}

/** Add a stop at offset o with the interpolated colour. Returns { stops, index }. */
export function addStop(stops, o) {
  const s = normalizeStops(stops).map((x) => ({ ...x }));
  const at = clamp(o, 0, 1);
  const { c, a } = colorAt(s, at);
  const added = { o: at, c, a, mid: 50 };
  // the split segment's midpoint resets to 50 on both halves
  const left = [...s].reverse().find((x) => x.o <= at);
  if (left) left.mid = 50;
  s.push(added);
  s.sort((x, y) => x.o - y.o);
  return { stops: s, index: s.indexOf(added) };
}

export function deleteStop(stops, index) {
  const s = normalizeStops(stops);
  if (s.length <= 2 || index < 0 || index >= s.length) return s;
  return s.filter((_, i) => i !== index);
}

export function duplicateStop(stops, index, o) {
  const s = normalizeStops(stops).map((x) => ({ ...x }));
  const src = s[index];
  if (!src) return { stops: s, index };
  const copy = { ...src, o: clamp(o, 0, 1), mid: 50 };
  s.push(copy);
  s.sort((x, y) => x.o - y.o);
  return { stops: s, index: s.indexOf(copy) };
}

/** Alt-drop onto another stop: swap colour/opacity, keep locations. */
export function swapStops(stops, i, j) {
  const s = normalizeStops(stops).map((x) => ({ ...x }));
  if (!s[i] || !s[j] || i === j) return s;
  const { c, a } = s[i];
  s[i].c = s[j].c; s[i].a = s[j].a;
  s[j].c = c; s[j].a = a;
  return s;
}

/** Move stop i to offset o (keeps order by re-sorting). Returns { stops, index }. */
export function moveStop(stops, index, o) {
  const s = normalizeStops(stops).map((x) => ({ ...x }));
  if (!s[index]) return { stops: s, index };
  const moved = s[index];
  moved.o = clamp(o, 0, 1);
  s.sort((x, y) => x.o - y.o);
  return { stops: s, index: s.indexOf(moved) };
}

/** Recolour stop i (Illustrator: Color / Swatches / Eyedropper with a stop selected). A fresh array; other stops untouched. */
export function recolorStop(stops, index, color) {
  const s = normalizeStops(stops).map((x) => ({ ...x }));
  const c = normalizeColor(color, null);
  if (!c || !s[index]) return s;
  s[index].c = c;
  return s;
}

/**
 * Does colour input go to the selected gradient stop? Only while a stop (not a
 * midpoint) was clicked, the selection still has a gradient on the same
 * Fill/Stroke, and the index is valid.
 */
export function stopSelectionLive({ active, index, count, attr, stopAttr, hasGradient, midpoint = -1 } = {}) {
  return !!active && !!hasGradient && !!attr && attr === stopAttr && !(midpoint >= 0)
    && Number.isInteger(index) && index >= 0 && index < (Number(count) || 0);
}

/* ───────────────────────────── geometry ───────────────────────────── */
export const normalizeAngle = (deg) => { let a = ((Number(deg) || 0) % 360 + 360) % 360; if (a > 180) a -= 360; return round(a, 4) === -180 ? 180 : round(a, 4); };
export const snapAngle = (deg, step = 45) => normalizeAngle(Math.round(deg / step) * step);
/** Unit direction in SVG (y-down) for an Illustrator angle (CCW). */
export const direction = (deg) => { const r = deg * Math.PI / 180; return { x: Math.cos(r), y: -Math.sin(r) }; };
export const angleOf = (dx, dy) => normalizeAngle(-Math.atan2(dy, dx) * 180 / Math.PI);

export function normalizeModel(m) {
  return {
    type: m?.type === 'radial' ? 'radial' : 'linear',
    ox: Number(m?.ox) || 0,
    oy: Number(m?.oy) || 0,
    angle: normalizeAngle(m?.angle),
    length: Math.max(EPS, Math.abs(Number(m?.length)) || 1),
    aspect: clamp(Number.isFinite(Number(m?.aspect)) && Number(m.aspect) > 0 ? Number(m.aspect) : 100, 0.5, 10000),
    stops: normalizeStops(m?.stops),
  };
}

/** Linear default for a bbox and angle: through the centre, spanning the object. */
export function fitLinear(bbox, angle = 0) {
  const w = bbox?.width || 0, h = bbox?.height || 0;
  const d = direction(angle);
  const L = Math.abs(w * d.x) + Math.abs(h * d.y) || 1;
  return { ox: w / 2 - d.x * L / 2, oy: h / 2 - d.y * L / 2, length: L, angle: normalizeAngle(angle) };
}
export function fitRadial(bbox) {
  const w = bbox?.width || 0, h = bbox?.height || 0;
  return { ox: w / 2, oy: h / 2, length: Math.max(w, h) / 2 || 1 };
}

/** Default model for a bbox (optionally keeping type/angle/aspect/stops). */
export function defaultModel(bbox, { type = 'linear', angle = 0, aspect = 100, stops } = {}) {
  const geo = type === 'radial' ? { ...fitRadial(bbox), angle } : fitLinear(bbox, angle);
  return normalizeModel({ type, aspect, stops, ...geo });
}

/** Key points: origin, end (angle axis) and aspect point (perpendicular), local. */
export function modelPoints(model) {
  const m = normalizeModel(model);
  const d = direction(m.angle);
  const perp = { x: -d.y, y: d.x }; // gradient-local +y after rotate(-θ)
  const o = { x: m.ox, y: m.oy };
  const aspectLen = m.type === 'radial' ? m.length * m.aspect / 100 : m.length;
  return { origin: o, end: { x: o.x + d.x * m.length, y: o.y + d.y * m.length }, aspectPoint: { x: o.x + perp.x * aspectLen, y: o.y + perp.y * aspectLen } };
}

/** Rebuild a model from points (origin, end, optional aspect point). */
export function modelFromPoints(base, origin, end, aspectPoint = null) {
  const m = normalizeModel(base);
  const dx = end.x - origin.x, dy = end.y - origin.y;
  const L = Math.hypot(dx, dy);
  const out = { ...m, ox: origin.x, oy: origin.y, length: L > EPS ? L : m.length, angle: L > EPS ? angleOf(dx, dy) : m.angle };
  if (aspectPoint && m.type === 'radial' && L > EPS) {
    const ax = aspectPoint.x - origin.x, ay = aspectPoint.y - origin.y;
    // component perpendicular to the main axis
    const perp = Math.abs((dx * ay - dy * ax) / L);
    out.aspect = clamp(perp / L * 100, 0.5, 10000);
  }
  return normalizeModel(out);
}

/** Map a model through an affine matrix (flip, document → local, …). */
export function transformModel(model, m) {
  const p = modelPoints(model);
  return modelFromPoints(model, apply(m, p.origin), apply(m, p.end), apply(m, p.aspectPoint));
}

/** Mirror within the bbox (Object ▸ Transform ▸ Reflect / flip). */
export function flipModel(model, bbox, axis) {
  const w = bbox?.width || 0, h = bbox?.height || 0;
  const m = axis === 'v' ? mat(1, 0, 0, -1, 0, h) : mat(-1, 0, 0, 1, w, 0);
  return transformModel(model, m);
}

/**
 * Document-space gradient (one vector across a multi-selection) → one object's
 * local model. `docFromLocal` maps the element's user space to document space
 * (its transform), `bbox` is its local getBBox().
 */
export function modelFromDocument(docModel, docFromLocal, bbox) {
  const inv = invert(docFromLocal) || IDENTITY;
  const toRel = multiply(translate(-(bbox?.x || 0), -(bbox?.y || 0)), inv);
  return transformModel(docModel, toRel);
}
/** Local model → document space (for annotators). */
export function modelToDocument(model, docFromLocal, bbox) {
  return transformModel(model, multiply(docFromLocal, translate(bbox?.x || 0, bbox?.y || 0)));
}

/* ───────────────────────────── SVG encode / decode ───────────────────────────── */
/** Attributes for the gradient element (OBB) and its stop specs. */
export function encodeGradient(model, bbox) {
  const m = normalizeModel(model);
  const w = bbox?.width || 0, h = bbox?.height || 0;
  if (!(w > EPS) || !(h > EPS)) return null; // OBB gradients don't render on zero-size boxes
  const r = (v) => round(v, 4);
  const base = `scale(${round(1 / w, 8)} ${round(1 / h, 8)}) rotate(${r(-m.angle)} ${r(m.ox)} ${r(m.oy)})`;
  const attrs = { [GRADIENT_ATTR]: '1', spreadMethod: 'pad' };
  let tag;
  if (m.type === 'radial') {
    tag = 'radialGradient';
    Object.assign(attrs, { cx: r(m.ox), cy: r(m.oy), fx: r(m.ox), fy: r(m.oy), r: r(m.length) });
    attrs.gradientTransform = m.aspect === 100 ? base : `${base} translate(${r(m.ox)} ${r(m.oy)}) scale(1 ${round(m.aspect / 100, 6)}) translate(${r(-m.ox)} ${r(-m.oy)})`;
  } else {
    tag = 'linearGradient';
    Object.assign(attrs, { x1: r(m.ox), y1: r(m.oy), x2: r(m.ox + m.length), y2: r(m.oy) });
    attrs.gradientTransform = base;
  }
  return { tag, attrs, stops: expandStops(m.stops) };
}

const num = (v, d) => { if (v == null || v === '') return d; const s = String(v).trim(); const n = parseFloat(s); return Number.isFinite(n) ? (s.endsWith('%') ? n / 100 : n) : d; };

/**
 * Read any linear/radial gradient (ours or third-party OBB) at the element's
 * current bbox. `spec` = { tag, attrs: {…}, stops: [{offset,color,opacity,midpoint,synthetic}] }.
 */
export function decodeGradient(spec, bbox) {
  if (!spec) return null;
  const tag = String(spec.tag || '').toLowerCase();
  const at = spec.attrs || {};
  const w = bbox?.width || 0, h = bbox?.height || 0;
  const userSpace = at.gradientUnits === 'userSpaceOnUse';
  const M = multiply(userSpace ? translate(-(bbox?.x || 0), -(bbox?.y || 0)) : scale(w || 1, h || 1), parseTransform(at.gradientTransform));
  const stops = readStops(spec.stops);
  if (tag === 'radialgradient') {
    const cx = num(at.cx, userSpace ? 0 : 0.5), cy = num(at.cy, userSpace ? 0 : 0.5), r0 = num(at.r, userSpace ? 0 : 0.5);
    const c = apply(M, { x: cx, y: cy }), u = apply(M, { x: cx + r0, y: cy }), v = apply(M, { x: cx, y: cy + r0 });
    return modelFromPoints({ type: 'radial', stops }, c, u, v);
  }
  if (tag === 'lineargradient') {
    const p1 = apply(M, { x: num(at.x1, 0), y: num(at.y1, 0) });
    const p2 = apply(M, { x: num(at.x2, userSpace ? 0 : 1), y: num(at.y2, 0) });
    return modelFromPoints({ type: 'linear', stops }, p1, p2);
  }
  return null;
}

/** CSS preview (wells, thumbnails, swatches). */
export function cssGradient(model, { forceLinear = false, angle = null } = {}) {
  const m = normalizeModel(model);
  const parts = expandStops(m.stops).map((s) => {
    const [r, g, b] = rgb(s.color);
    return `rgba(${r}, ${g}, ${b}, ${round(s.opacity, 3)}) ${round(s.offset * 100, 2)}%`;
  }).join(', ');
  if (m.type === 'radial' && !forceLinear) return `radial-gradient(circle, ${parts})`;
  const deg = angle ?? (90 - m.angle); // CSS: 0deg = up, clockwise
  return `linear-gradient(${round(deg, 2)}deg, ${parts})`;
}

/* ───────────────────────────── swatches ───────────────────────────── */
export const GRADIENT_SWATCHES_KEY = 'visteras-vector-gradient-swatches';
export const GRADIENT_LAST_KEY = 'visteras-vector-gradient-last';
export const GRADIENT_ANNOTATOR_KEY = 'visteras-vector-gradient-annotator';
const st = (o, c, a = 1, mid = 50) => ({ o, c, a, mid });
export const GRADIENT_PRESETS = Object.freeze([
  { id: 'preset-white-black', name: 'White, Black', type: 'linear', angle: 0, aspect: 100, stops: [st(0, '#ffffff'), st(1, '#000000')] },
  { id: 'preset-white-black-radial', name: 'White, Black Radial', type: 'radial', angle: 0, aspect: 100, stops: [st(0, '#ffffff'), st(1, '#000000')] },
  { id: 'preset-fade-black', name: 'Fade to Black', type: 'linear', angle: 0, aspect: 100, stops: [st(0, '#000000', 1), st(1, '#000000', 0)] },
  { id: 'preset-orange-yellow', name: 'Orange, Yellow', type: 'linear', angle: 0, aspect: 100, stops: [st(0, '#fa7c1b'), st(1, '#ffe14d')] },
  { id: 'preset-blue-teal', name: 'Blue, Teal', type: 'linear', angle: 0, aspect: 100, stops: [st(0, '#1d4ed8'), st(1, '#14b8a6')] },
  { id: 'preset-sunset', name: 'Sunset', type: 'linear', angle: 90, aspect: 100, stops: [st(0, '#2b1055'), st(0.55, '#e0457b'), st(1, '#ffb347')] },
]);

export function normalizeSwatch(s) {
  if (!s || typeof s !== 'object') return null;
  const m = normalizeModel({ type: s.type, angle: s.angle, aspect: s.aspect, stops: s.stops });
  return { id: String(s.id || `grad-${Date.now().toString(36)}`), name: String(s.name || 'Gradient'), type: m.type, angle: m.angle, aspect: m.aspect, stops: m.stops };
}
export function parseSwatchList(raw) {
  try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v.map(normalizeSwatch).filter(Boolean) : []; } catch { return []; }
}
export const swatchFromModel = (model, name = 'Gradient', id) => normalizeSwatch({ id: id || `grad-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, ...normalizeModel(model) });
