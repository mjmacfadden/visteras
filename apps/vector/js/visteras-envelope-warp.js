/**
 * Envelope Distort ▸ Warp maths. Pure: no DOM, no window, no storage.
 *
 * The 15 Illustrator warp styles are approximations of Adobe's unpublished
 * formulas [unverified], designed so bend 0 + distortion 0 is the identity and
 * a negative bend mirrors the effect.
 */
import { normalizeParams, normalizeOpts } from './visteras-envelope-core.js?v=envelope-11';

export const STYLE_LABELS = Object.freeze([
  ['arc', 'Arc'], ['arcLower', 'Arc Lower'], ['arcUpper', 'Arc Upper'], ['arch', 'Arch'], ['bulge', 'Bulge'],
  ['shellLower', 'Shell Lower'], ['shellUpper', 'Shell Upper'], ['flag', 'Flag'], ['wave', 'Wave'], ['fish', 'Fish'],
  ['rise', 'Rise'], ['fisheye', 'Fisheye'], ['inflate', 'Inflate'], ['squeeze', 'Squeeze'], ['twist', 'Twist'],
]);

/* Styles in normalised, horizontal space: u, v ∈ [-1, 1] (v grows downward, SVG),
   hw/hh = half width/height in px (for shapes that must stay circular). */
const STYLE_FN = {
  arc(u, v, b, hw, hh) {
    const theta = b * Math.PI / 2;
    if (Math.abs(theta) < 1e-9) return [u, v];
    const R = hw / Math.sin(theta), phi = u * theta, r = R - v * hh;
    return [(r * Math.sin(phi)) / hw, (R - r * Math.cos(phi)) / hh];
  },
  arcLower: (u, v, b) => [u, v + b * (1 - u * u) * (v + 1) / 2],
  arcUpper: (u, v, b) => [u, v - b * (1 - u * u) * (1 - v) / 2],
  arch: (u, v, b) => [u, v - b * (1 - u * u)],
  bulge: (u, v, b) => [u, v + b * (1 - u * u) * v],
  shellLower: (u, v, b) => [u * (1 - 0.3 * b * (1 - v) / 2), v + b * (1 - u * u) * (v + 1) / 2],
  shellUpper: (u, v, b) => [u * (1 - 0.3 * b * (1 + v) / 2), v - b * (1 - u * u) * (1 - v) / 2],
  flag: (u, v, b) => [u, v - b * Math.sin(Math.PI * u)],
  wave: (u, v, b) => [u, v - b * Math.sin(Math.PI * u) * v],
  fish(u, v, b) {
    // Thick body on the left, pinch before the tail, tail flares at the right edge.
    const body = 0.5 * Math.cos(Math.PI * (u + 0.2) / 2.4);
    const pinch = 0.6 * Math.exp(-(((u - 0.55) / 0.18) ** 2));
    const flare = 0.9 * Math.max(0, (u - 0.7) / 0.3) ** 2;
    return [u, v * (1 + b * (body - pinch + flare))];
  },
  rise: (u, v, b) => [u, v - b * ((u + 1) / 2) * (0.5 + 0.5 * u * u)],
  fisheye(u, v, b) {
    const r2 = u * u + v * v;
    if (r2 >= 1) return [u, v];
    const s = 1 + b * (1 - r2);
    return [u * s, v * s];
  },
  inflate: (u, v, b) => [u * (1 + 0.5 * b * (1 - v * v)), v * (1 + 0.5 * b * (1 - u * u))],
  squeeze: (u, v, b) => [u, v * (1 - b * (1 - u * u))],
  twist(u, v, b, hw, hh) {
    const r = Math.min(1, Math.hypot(u, v) / Math.SQRT2);
    const a = b * Math.PI / 2 * (1 - r);
    if (!a) return [u, v];
    const x = u * hw, y = v * hh, c = Math.cos(a), s = Math.sin(a);
    return [(x * c - y * s) / hw, (x * s + y * c) / hh];
  },
};

/** Padded bbox so lines (zero width/height) still have a usable warp space. */
export function warpBox(bbox) {
  let [x, y, w, h] = bbox.map(Number);
  const pad = Math.max(w, h, 1);
  if (!(w > 1e-9)) { x -= pad / 2; w = pad; }
  if (!(h > 1e-9)) { y -= pad / 2; h = pad; }
  return [x, y, w, h];
}

export function isIdentity(params) {
  const p = normalizeParams(params);
  return !p.bend && !p.dh && !p.dv;
}

/** Map one document point through the warp. bbox = [x, y, w, h]. */
export function warpPoint(x, y, bbox, params) {
  const p = normalizeParams(params);
  if (!p.bend && !p.dh && !p.dv) return [x, y];
  let [x0, y0, w, h] = warpBox(bbox);
  let u = 2 * (x - x0) / w - 1, v = 2 * (y - y0) / h - 1;
  const b = p.bend / 100, dh = p.dh / 100, dv = p.dv / 100;
  const vertical = p.dir === 'v';
  if (vertical) { [u, v] = [v, u]; [w, h] = [h, w]; }
  // Distortion first (perspective-like): horizontal scales the vertical extent along u, vertical the horizontal along v.
  v = v * (1 + dh * u);
  u = u * (1 + dv * v);
  [u, v] = STYLE_FN[p.style](u, v, b, w / 2, h / 2);
  if (vertical) { [u, v] = [v, u]; [w, h] = [h, w]; }
  return [x0 + (u + 1) * w / 2, y0 + (v + 1) * h / 2];
}

/** Numeric Jacobian of the warp at (x, y). */
function jacobian(x, y, bbox, params, eps) {
  const [ax, ay] = warpPoint(x + eps, y, bbox, params), [bx, by] = warpPoint(x - eps, y, bbox, params);
  const [cx, cy] = warpPoint(x, y + eps, bbox, params), [dx, dy] = warpPoint(x, y - eps, bbox, params);
  return [(ax - bx) / (2 * eps), (ay - by) / (2 * eps), (cx - dx) / (2 * eps), (cy - dy) / (2 * eps)];
}

/* ── Path data → absolute cubic segments ────────────────────────────── */

/** A segment is {type:'M'|'C'|'Z', pts}. Lines, quadratics and arcs become cubics. */
export function parsePathData(d) {
  const tokens = String(d || '').match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
  const out = [];
  let i = 0, cmd = null, cx = 0, cy = 0, sx = 0, sy = 0, lastC = null, lastQ = null;
  const num = () => Number(tokens[i++]);
  const isNum = () => i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i]);
  const line = (x, y) => { out.push({ type: 'C', pts: [cx + (x - cx) / 3, cy + (y - cy) / 3, cx + 2 * (x - cx) / 3, cy + 2 * (y - cy) / 3, x, y] }); cx = x; cy = y; };
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) cmd = tokens[i++];
    else if (!cmd) { i++; continue; }
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const ox = rel ? cx : 0, oy = rel ? cy : 0;
    let qc = null, cc = null;
    switch (C) {
      case 'M': { const x = num() + ox, y = num() + oy; out.push({ type: 'M', pts: [x, y] }); cx = sx = x; cy = sy = y; cmd = rel ? 'l' : 'L'; break; }
      case 'L': line(num() + ox, num() + oy); break;
      case 'H': line(num() + ox, cy); break;
      case 'V': line(cx, num() + oy); break;
      case 'C': { const p = [num() + ox, num() + oy, num() + ox, num() + oy, num() + ox, num() + oy]; out.push({ type: 'C', pts: p }); cc = [p[2], p[3]]; cx = p[4]; cy = p[5]; break; }
      case 'S': {
        const r = lastC ? [2 * cx - lastC[0], 2 * cy - lastC[1]] : [cx, cy];
        const p = [r[0], r[1], num() + ox, num() + oy, num() + ox, num() + oy]; out.push({ type: 'C', pts: p }); cc = [p[2], p[3]]; cx = p[4]; cy = p[5]; break;
      }
      case 'Q': case 'T': {
        const q = C === 'Q' ? [num() + ox, num() + oy] : (lastQ ? [2 * cx - lastQ[0], 2 * cy - lastQ[1]] : [cx, cy]);
        const x = num() + ox, y = num() + oy;
        out.push({ type: 'C', pts: [cx + 2 / 3 * (q[0] - cx), cy + 2 / 3 * (q[1] - cy), x + 2 / 3 * (q[0] - x), y + 2 / 3 * (q[1] - y), x, y] });
        qc = q; cx = x; cy = y; break;
      }
      case 'A': {
        const rx = num(), ry = num(), rot = num(), large = num(), sweep = num(), x = num() + ox, y = num() + oy;
        for (const seg of arcToCubics(cx, cy, rx, ry, rot, large, sweep, x, y)) out.push({ type: 'C', pts: seg });
        cx = x; cy = y; break;
      }
      case 'Z': out.push({ type: 'Z', pts: [] }); cx = sx; cy = sy; break;
      default: i++;
    }
    lastC = cc; lastQ = qc;
    if (C === 'Z' && isNum()) cmd = 'L';
  }
  return out;
}

export function arcToCubics(x1, y1, rx, ry, angle, large, sweep, x2, y2) {
  if (!rx || !ry || (x1 === x2 && y1 === y2)) return x1 === x2 && y1 === y2 ? [] : [[x1 + (x2 - x1) / 3, y1 + (y2 - y1) / 3, x1 + 2 * (x2 - x1) / 3, y1 + 2 * (y2 - y1) / 3, x2, y2]];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const phi = angle * Math.PI / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const xp = cos * dx + sin * dy, yp = -sin * dx + cos * dy;
  const lam = xp * xp / (rx * rx) + yp * yp / (ry * ry);
  if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
  const sign = (large ? 1 : 0) === (sweep ? 1 : 0) ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const co = sign * Math.sqrt(Math.max(0, num / (rx * rx * yp * yp + ry * ry * xp * xp)));
  const cxp = co * rx * yp / ry, cyp = -co * ry * xp / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI; else if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.ceil(Math.abs(dt) / (Math.PI / 2)), step = dt / n, k = 4 / 3 * Math.tan(step / 4);
  const pt = (t) => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const der = (t) => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  const segs = [];
  for (let j = 0; j < n; j++) {
    const a = t1 + j * step, b = a + step, p0 = pt(a), p3 = pt(b), d0 = der(a), d3 = der(b);
    segs.push([p0[0] + k * d0[0], p0[1] + k * d0[1], p3[0] - k * d3[0], p3[1] - k * d3[1], p3[0], p3[1]]);
  }
  if (segs.length) { segs.at(-1)[4] = x2; segs.at(-1)[5] = y2; }
  return segs;
}

/** Basic shapes → path data (absolute). Returns null for unsupported elements. */
export function shapeToPathData(tag, a) {
  const n = (k, def = 0) => { const v = parseFloat(a[k]); return Number.isFinite(v) ? v : def; };
  switch (tag) {
    case 'path': return a.d || '';
    case 'rect': {
      const x = n('x'), y = n('y'), w = n('width'), h = n('height');
      let rx = a.rx != null ? n('rx') : (a.ry != null ? n('ry') : 0), ry = a.ry != null ? n('ry') : rx;
      rx = Math.min(Math.abs(rx), w / 2); ry = Math.min(Math.abs(ry), h / 2);
      if (!rx || !ry) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
    }
    case 'circle': case 'ellipse': {
      const cx = n('cx'), cy = n('cy'), rx = tag === 'circle' ? n('r') : n('rx'), ry = tag === 'circle' ? n('r') : n('ry');
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
    }
    case 'line': return `M${n('x1')} ${n('y1')}L${n('x2')} ${n('y2')}`;
    case 'polyline': case 'polygon': {
      const p = String(a.points || '').trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
      if (p.length < 4) return '';
      let d = `M${p[0]} ${p[1]}`; for (let i = 2; i + 1 < p.length; i += 2) d += `L${p[i]} ${p[i + 1]}`;
      return tag === 'polygon' ? d + 'Z' : d;
    }
    default: return null;
  }
}

/* ── Matrices ([a b c d e f], SVG order) ────────────────────────────── */
export const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);
export const multiply = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
export const applyMatrix = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
export function invert(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det) return null;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}
/** Parse an SVG transform attribute (translate/scale/rotate/skewX/skewY/matrix). */
export function parseTransform(text) {
  let m = [...IDENTITY];
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g; let r;
  while ((r = re.exec(String(text || '')))) {
    const v = r[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let t;
    switch (r[1]) {
      case 'matrix': t = v.length === 6 ? v : IDENTITY; break;
      case 'translate': t = [1, 0, 0, 1, v[0] || 0, v[1] || 0]; break;
      case 'scale': t = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0]; break;
      case 'rotate': {
        const a = (v[0] || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
        t = [c, s, -s, c, 0, 0];
        if (v.length >= 3) t = multiply(multiply([1, 0, 0, 1, v[1], v[2]], t), [1, 0, 0, 1, -v[1], -v[2]]);
        break;
      }
      case 'skewX': t = [1, 0, Math.tan((v[0] || 0) * Math.PI / 180), 1, 0, 0]; break;
      case 'skewY': t = [1, Math.tan((v[0] || 0) * Math.PI / 180), 0, 1, 0, 0]; break;
    }
    m = multiply(m, t);
  }
  return m;
}

export function transformSegments(segs, m) {
  return segs.map((s) => {
    const pts = [];
    for (let i = 0; i < s.pts.length; i += 2) pts.push(...applyMatrix(m, s.pts[i], s.pts[i + 1]));
    return { type: s.type, pts };
  });
}

/* ── Warping with adaptive subdivision ──────────────────────────────── */

/** Fidelity 0 → ~diag/10, 100 → ~diag/10⁴. */
export function warpTolerance(bbox, fidelity) {
  const [, , w, h] = warpBox(bbox);
  const f = normalizeOpts({ fidelity }).fidelity;
  return Math.hypot(w, h) * 10 ** (-1 - 3 * f / 100);
}

const bez = (p, t) => {
  const mt = 1 - t;
  return [mt ** 3 * p[0] + 3 * mt * mt * t * p[2] + 3 * mt * t * t * p[4] + t ** 3 * p[6],
    mt ** 3 * p[1] + 3 * mt * mt * t * p[3] + 3 * mt * t * t * p[5] + t ** 3 * p[7]];
};
function split(p) {
  const l = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const p0 = [p[0], p[1]], p1 = [p[2], p[3]], p2 = [p[4], p[5]], p3 = [p[6], p[7]];
  const a = l(p0, p1), b = l(p1, p2), c = l(p2, p3), d = l(a, b), e = l(b, c), m = l(d, e);
  return [[...p0, ...a, ...d, ...m], [...m, ...e, ...c, ...p3]];
}

/**
 * Warp segments (absolute, document space). Returns {segments, stats}.
 * Each cubic is subdivided until the warped curve (endpoints + handles mapped through the
 * local Jacobian) stays within tol of the true warped curve; depth 1..10.
 */
export function warpSegments(segs, bbox, params, opts = {}) {
  const p = normalizeParams(params);
  if (isIdentity(p)) return { segments: segs.map((s) => ({ type: s.type, pts: [...s.pts] })), stats: { maxDepth: 0, maxError: 0 } };
  const tol = warpTolerance(bbox, opts.fidelity ?? 50);
  const [, , w, h] = warpBox(bbox), eps = Math.max(w, h) * 1e-4;
  const W = (x, y) => warpPoint(x, y, bbox, p);
  const stats = { maxDepth: 0, maxError: 0 };
  const out = [];
  let cur = null;
  const fit = (c) => {
    const P0 = W(c[0], c[1]), P3 = W(c[6], c[7]);
    const J0 = jacobian(c[0], c[1], bbox, p, eps), J3 = jacobian(c[6], c[7], bbox, p, eps);
    const h0 = [c[2] - c[0], c[3] - c[1]], h3 = [c[4] - c[6], c[5] - c[7]];
    return [...P0, P0[0] + J0[0] * h0[0] + J0[2] * h0[1], P0[1] + J0[1] * h0[0] + J0[3] * h0[1],
      P3[0] + J3[0] * h3[0] + J3[2] * h3[1], P3[1] + J3[1] * h3[0] + J3[3] * h3[1], ...P3];
  };
  const emit = (c, depth) => {
    const cand = fit(c);
    let err = 0;
    for (const t of [0.25, 0.5, 0.75]) {
      const [x, y] = bez(c, t), [tx, ty] = W(x, y), [cx, cy] = bez(cand, t);
      err = Math.max(err, Math.hypot(tx - cx, ty - cy));
    }
    if ((depth < 1 || err > tol) && depth < 10) { const [a, b] = split(c); emit(a, depth + 1); emit(b, depth + 1); return; }
    stats.maxDepth = Math.max(stats.maxDepth, depth); stats.maxError = Math.max(stats.maxError, err);
    out.push({ type: 'C', pts: cand.slice(2) });
  };
  let start = null;
  for (const s of segs) {
    if (s.type === 'M') { cur = [s.pts[0], s.pts[1]]; start = [...cur]; out.push({ type: 'M', pts: W(cur[0], cur[1]) }); }
    else if (s.type === 'Z') {
      // The implicit closing edge is straight in the source but curved after warping.
      if (cur && start && Math.hypot(cur[0] - start[0], cur[1] - start[1]) > 1e-9) {
        emit([...cur, cur[0] + (start[0] - cur[0]) / 3, cur[1] + (start[1] - cur[1]) / 3, cur[0] + 2 * (start[0] - cur[0]) / 3, cur[1] + 2 * (start[1] - cur[1]) / 3, ...start], 0);
      }
      out.push({ type: 'Z', pts: [] }); if (start) cur = [...start];
    }
    else if (cur) { emit([...cur, ...s.pts], 0); cur = [s.pts[4], s.pts[5]]; }
  }
  return { segments: out, stats };
}

const fmt = (v) => { const r = Math.round(v * 1000) / 1000; return Object.is(r, -0) ? '0' : String(r); };
/** Segments → compact absolute path data. Straight cubics are kept as cubics (exact). */
export function segmentsToPathData(segs) {
  return segs.map((s) => s.type === 'Z' ? 'Z' : s.type + s.pts.map(fmt).join(' ')).join('');
}
export const countNodes = (segs) => segs.filter((s) => s.type !== 'Z').length;

/** Bounds of segments (control-point hull; tight enough for export/visual bounds). */
export function segmentsBounds(segs) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of segs) for (let i = 0; i < s.pts.length; i += 2) {
    x0 = Math.min(x0, s.pts[i]); x1 = Math.max(x1, s.pts[i]); y0 = Math.min(y0, s.pts[i + 1]); y1 = Math.max(y1, s.pts[i + 1]);
  }
  return Number.isFinite(x0) ? [x0, y0, x1 - x0, y1 - y0] : null;
}

/** The warped outline of the bbox (used by Release and Preserve Shape: Clipping Mask). */
export function warpedBoxPathData(bbox, params, opts = {}) {
  const [x, y, w, h] = bbox.map(Number);
  const segs = parsePathData(`M${x} ${y}H${x + w}V${y + h}H${x}Z`);
  return segmentsToPathData(warpSegments(segs, bbox, params, opts).segments);
}
