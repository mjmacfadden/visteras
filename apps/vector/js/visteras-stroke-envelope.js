/**
 * Visteras Vector — stroke envelope geometry (Offset Path / Outline Stroke).
 *
 * Paper.js boolean operations work on fill geometry only: setting strokeWidth
 * on a clone and uniting it with the original returns the original shape
 * unchanged. That is why Offset Path produced an identical copy and Outline
 * Stroke produced nothing. This module builds the region a stroke of radius r
 * actually covers (Minkowski sum of the outline with a disk, with SVG-style
 * joins and caps) as real geometry:
 *
 *   envelope = ⋃ edge quads  ∪  ⋃ join pieces (round wedge / miter / bevel)
 *              ∪ caps (open paths)
 *
 *   offset +d   = original ∪ envelope(d)        (outer joins apply)
 *   offset −d   = original − envelope(d)        (joins apply at concave corners)
 *   outline(w)  = envelope(w/2)  [∩ original for Inside, − original for Outside]
 *
 * The point helpers are pure (unit-tested); the Paper helpers take a scope.
 */

const EPS = 1e-9;

/** Remove consecutive duplicates (and the closing duplicate of a closed ring). */
export function dedupePoints(pts, closed) {
  const out = [];
  for (const p of pts || []) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-7) out.push([p[0], p[1]]);
  }
  if (closed && out.length > 1) {
    const a = out[0]; const b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1e-7) out.pop();
  }
  // Drop vertices that continue straight on: their quads would share an edge
  // exactly, which Paper's booleans handle poorly.
  const straight = (a, p, b) => {
    const d1 = [p[0] - a[0], p[1] - a[1]]; const d2 = [b[0] - p[0], b[1] - p[1]];
    const l = Math.hypot(...d1) * Math.hypot(...d2);
    return l > 0 && Math.abs(d1[0] * d2[1] - d1[1] * d2[0]) / l < 1e-9 && d1[0] * d2[0] + d1[1] * d2[1] > 0;
  };
  for (let changed = true; changed && out.length > 2;) {
    changed = false;
    const n = out.length;
    for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
      if (straight(out[(i - 1 + n) % n], out[i], out[(i + 1) % n])) { out.splice(i, 1); changed = true; break; }
    }
  }
  return out;
}

/** Number of arc steps so the chord error stays under tol. */
export function arcSteps(r, angle, tol = 0.1) {
  const a = Math.abs(angle);
  if (a < EPS || r <= 0) return 0;
  const t = Math.min(Math.max(tol, 1e-4), r);
  const step = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - t / r)));
  return Math.max(1, Math.ceil(a / Math.max(step, 1e-3)));
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const norm = (a) => { const l = Math.hypot(a[0], a[1]); return l < EPS ? [0, 0] : [a[0] / l, a[1] / l]; };
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const leftN = (d) => [-d[1], d[0]];

/** Arc points around c from direction u to direction v (radius r, shorter way). */
function arcPoints(c, u, v, r, tol) {
  const a0 = Math.atan2(u[1], u[0]);
  let da = Math.atan2(v[1], v[0]) - a0;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;
  const n = arcSteps(r, da, tol);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (da * i) / n;
    pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  return pts;
}

/**
 * Polygons whose union is the area covered by stroking the polyline with a
 * stroke of half-width r.
 * @param {number[][]} pts polyline vertices
 * @param {boolean} closed
 * @param {number} r half stroke width (> 0)
 * @param {{join?:'round'|'miter'|'bevel', miterLimit?:number, cap?:'butt'|'round'|'square', tol?:number}} [o]
 * @returns {number[][][]} polygons
 */
export function strokePieces(pts, closed, r, o = {}) {
  const join = o.join || 'miter';
  const miterLimit = Math.max(1, Number(o.miterLimit) || 4);
  const cap = o.cap || 'butt';
  const tol = o.tol || 0.1;
  const P = dedupePoints(pts, closed);
  const out = [];
  if (!(r > 0) || P.length === 0) return out;
  if (P.length === 1) {
    if (cap === 'round' || closed) {
      const k = Math.max(8, arcSteps(r, 2 * Math.PI, tol));
      out.push(Array.from({ length: k }, (_, i) => [P[0][0] + r * Math.cos((2 * Math.PI * i) / k), P[0][1] + r * Math.sin((2 * Math.PI * i) / k)]));
    }
    return out;
  }
  const n = P.length;
  const edgeCount = closed ? n : n - 1;
  const dirs = [];
  for (let i = 0; i < edgeCount; i++) dirs.push(norm(sub(P[(i + 1) % n], P[i])));
  // Outer points of the join at vertex vi (from the end of the incoming
  // quad's gap-side corner to the start of the outgoing one), or null when the
  // path continues straight. side = +1 when the gap is on the left (+normal).
  const joinAt = (vi, d1, d2) => {
    const p = P[vi];
    const c = cross(d1, d2);
    if (Math.abs(c) < 1e-9 && dot(d1, d2) > 0) return null; // straight: no gap
    // Gap is on the outer side of the turn (right of travel for a left turn).
    const side = c > 0 ? -1 : 1;
    const g1 = mul(leftN(d1), side);
    const g2 = mul(leftN(d2), side);
    const e1 = add(p, mul(g1, r));
    const e2 = add(p, mul(g2, r));
    if (join === 'round') {
      // A full reversal is ambiguous for the short-way arc: go round the front.
      const pts = dot(g1, g2) < -0.999999
        ? [...arcPoints(p, g1, d1, r, tol), ...arcPoints(p, d1, g2, r, tol).slice(1)]
        : arcPoints(p, g1, g2, r, tol);
      return { side, pts };
    }
    if (join === 'miter') {
      const cosTheta = Math.max(-1, Math.min(1, dot(g1, g2)));
      const half = Math.acos(cosTheta) / 2; // half the angle between the offset normals
      const ratio = 1 / Math.max(Math.cos(half), EPS); // miter length / stroke width (SVG definition)
      if (ratio <= miterLimit) return { side, pts: [e1, add(p, mul(norm(add(g1, g2)), r * ratio)), e2] };
    }
    return { side, pts: [e1, e2] }; // bevel (or miter over the limit)
  };
  // One polygon per edge: its quad plus the join at its end vertex (half the
  // pieces of separate quads + joins, and no collinear shared sides).
  for (let i = 0; i < edgeCount; i++) {
    const a = P[i]; const b = P[(i + 1) % n]; const nn = mul(leftN(dirs[i]), r);
    const hasJoin = closed || i < edgeCount - 1;
    const j = hasJoin ? joinAt((i + 1) % n, dirs[i], dirs[(i + 1) % edgeCount]) : null;
    const poly = [add(a, nn)];
    if (j && j.side === 1) poly.push(...j.pts, sub(b, nn));
    else if (j) poly.push(add(b, nn), ...[...j.pts].reverse());
    else poly.push(add(b, nn), sub(b, nn));
    poly.push(sub(a, nn));
    out.push(poly);
  }
  if (!closed) {
    // Caps.
    const capAt = (p, d) => { // d points outward from the path end
      const nn = leftN(d);
      if (cap === 'round') out.push([p, ...arcPoints(p, nn, d, r, tol), ...arcPoints(p, d, mul(nn, -1), r, tol).slice(1)]);
      else if (cap === 'square') out.push([add(p, mul(nn, r)), add(add(p, mul(nn, r)), mul(d, r)), add(sub(p, mul(nn, r)), mul(d, r)), sub(p, mul(nn, r))]);
    };
    capAt(P[n - 1], dirs[edgeCount - 1]);
    capAt(P[0], mul(dirs[0], -1));
  }
  return out.filter((poly) => poly.length >= 3);
}

// ─── Paper.js helpers ───────────────────────────────────────────────────────

/** Sub-paths of a Path / CompoundPath as flattened polylines. */
export function flattenItem(scope, item, flatness = 0.1) {
  const paths = item instanceof scope.CompoundPath ? item.children : [item];
  const out = [];
  for (const p of paths) {
    if (!p?.segments?.length) continue;
    const c = p.clone({ insert: false });
    c.flatten(flatness);
    out.push({ closed: !!p.closed, pts: c.segments.map((s) => [s.point.x, s.point.y]) });
  }
  return out;
}

/** Balanced pairwise union (much faster than folding one growing shape). */
export function uniteAll(scope, items) {
  let list = items.filter(Boolean);
  if (!list.length) return null;
  while (list.length > 1) {
    const next = [];
    for (let i = 0; i < list.length; i += 2) {
      if (i + 1 >= list.length) { next.push(list[i]); continue; }
      next.push(list[i].unite(list[i + 1], { insert: false }));
    }
    list = next;
  }
  return list[0];
}

/**
 * The area covered by stroking `item` with half-width r, as a PathItem.
 * @param {object} scope PaperScope
 * @param {object} item Path | CompoundPath
 * @param {number} r
 * @param {{join?:string, miterLimit?:number, cap?:string, tol?:number}} [o]
 */
export function strokeEnvelope(scope, item, r, o = {}) {
  const tol = o.tol || Math.max(0.1, Math.min(0.35, r / 8));
  const pieces = [];
  for (const { closed, pts } of flattenItem(scope, item, tol)) {
    for (const poly of strokePieces(pts, closed, r, { ...o, tol })) {
      const path = new scope.Path({ segments: poly, closed: true, insert: false });
      if (Math.abs(path.area) < 1e-9) continue;
      path.clockwise = true;
      pieces.push(path);
    }
  }
  return uniteAll(scope, pieces);
}

/** Is any sub-path of the item open? */
export function hasOpenSubpath(scope, item) {
  const paths = item instanceof scope.CompoundPath ? item.children : [item];
  return paths.some((p) => p?.segments?.length && !p.closed);
}

/**
 * Offset a PathItem by d (positive grows, negative shrinks). Open paths grow
 * into their stroke outline; they cannot shrink (returns null).
 */
export function offsetItem(scope, item, d, o = {}) {
  if (!item || Math.abs(d) < 0.001) return null;
  const open = hasOpenSubpath(scope, item);
  const env = strokeEnvelope(scope, item, Math.abs(d), { cap: o.join === 'round' ? 'round' : 'butt', ...o });
  if (!env) return null;
  if (open) return d > 0 ? env : null;
  const res = d > 0 ? item.unite(env, { insert: false }) : item.subtract(env, { insert: false });
  if (!res || Math.abs(res.area || 0) < 1e-6) return null;
  return res;
}

/**
 * Outline a stroke: filled region of the stroke (width w) with SVG joins/caps.
 * align 'inside' keeps only the part inside the shape, 'outside' only outside.
 */
export function outlineItem(scope, item, w, o = {}) {
  if (!item || !(w > 0)) return null;
  const align = o.align || 'center';
  const r = align === 'center' ? w / 2 : w; // aligned strokes are w wide on one side
  let env = strokeEnvelope(scope, item, r, o);
  if (!env) return null;
  const open = hasOpenSubpath(scope, item);
  if (!open && align === 'inside') env = env.intersect(item, { insert: false });
  else if (!open && align === 'outside') env = env.subtract(item, { insert: false });
  if (!env || Math.abs(env.area || 0) < 1e-6) return null;
  return env;
}
