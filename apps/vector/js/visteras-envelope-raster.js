/**
 * Envelope raster (image) mesh warp. Pure maths; the canvas is injected so the
 * module never touches the DOM at import time.
 */
import { warpPoint, applyMatrix } from './visteras-envelope-warp.js?v=envelope-11';

/** Mesh resolution from Fidelity: 8 … 64 cells per side. */
export const meshSize = (fidelity) => Math.round(8 + 56 * Math.max(0, Math.min(100, Number(fidelity) || 0)) / 100);

/**
 * Build the warped mesh for an image of naturalW×naturalH drawn with matrix m
 * (image-pixel space → envelope space, including x/y/width/height scaling).
 * Returns {n, src:[[sx,sy]...], dst:[[x,y]...]} row-major (n+1)², and dst bounds.
 */
export function buildMesh(naturalW, naturalH, m, bbox, params, n) {
  const src = [], dst = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const sx = naturalW * i / n, sy = naturalH * j / n;
    const [ex, ey] = applyMatrix(m, sx, sy);
    const [wx, wy] = warpPoint(ex, ey, bbox, params);
    src.push([sx, sy]); dst.push([wx, wy]);
    x0 = Math.min(x0, wx); y0 = Math.min(y0, wy); x1 = Math.max(x1, wx); y1 = Math.max(y1, wy);
  }
  return { n, src, dst, bounds: [x0, y0, x1 - x0, y1 - y0] };
}

/** Affine matrix [a b c d e f] mapping triangle s0,s1,s2 onto d0,d1,d2 (null if degenerate). */
export function triangleAffine(s0, s1, s2, d0, d1, d2) {
  const den = (s1[0] - s0[0]) * (s2[1] - s0[1]) - (s2[0] - s0[0]) * (s1[1] - s0[1]);
  if (Math.abs(den) < 1e-12) return null;
  const solve = (k) => {
    const v0 = d0[k], v1 = d1[k], v2 = d2[k];
    const p = ((v1 - v0) * (s2[1] - s0[1]) - (v2 - v0) * (s1[1] - s0[1])) / den;
    const q = ((v2 - v0) * (s1[0] - s0[0]) - (v1 - v0) * (s2[0] - s0[0])) / den;
    return [p, q, v0 - p * s0[0] - q * s0[1]];
  };
  const [a, c, e] = solve(0), [b, d, f] = solve(1);
  return [a, b, c, d, e, f];
}

/** Triangles of the mesh as index triples. */
export function meshTriangles(n) {
  const tris = [], idx = (i, j) => j * (n + 1) + i;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    tris.push([idx(i, j), idx(i + 1, j), idx(i + 1, j + 1)], [idx(i, j), idx(i + 1, j + 1), idx(i, j + 1)]);
  }
  return tris;
}

/**
 * Draw the warped image into ctx (whose origin maps to dst bounds origin at `scale` px/unit).
 * Each triangle is clipped (slightly inflated to hide seams when anti-aliased) and drawn affinely.
 */
export function drawMesh(ctx, image, mesh, scale, { antiAlias = true } = {}) {
  const [ox, oy] = mesh.bounds;
  ctx.imageSmoothingEnabled = !!antiAlias;
  const P = (p) => [(p[0] - ox) * scale, (p[1] - oy) * scale];
  for (const [a, b, c] of meshTriangles(mesh.n)) {
    const d0 = P(mesh.dst[a]), d1 = P(mesh.dst[b]), d2 = P(mesh.dst[c]);
    const m = triangleAffine(mesh.src[a], mesh.src[b], mesh.src[c], d0, d1, d2);
    if (!m) continue;
    const cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3, grow = antiAlias ? 0.6 : 0;
    const g = (p) => { const dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1; return [p[0] + dx / l * grow, p[1] + dy / l * grow]; };
    ctx.save();
    ctx.beginPath(); ctx.moveTo(...g(d0)); ctx.lineTo(...g(d1)); ctx.lineTo(...g(d2)); ctx.closePath(); ctx.clip();
    ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.drawImage(image, 0, 0);
    ctx.restore();
  }
}
