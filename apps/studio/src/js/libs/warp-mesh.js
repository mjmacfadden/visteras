/**
 * Warp (Edit ▸ Transform ▸ Warp), phase 1: one bicubic Bézier patch with a
 * 4x4 control grid. Points are normalised to the layer's untransformed
 * rectangle (0..1), row-major: index = row * 4 + column.
 * Rendering subdivides the patch into a triangle mesh and draws each triangle
 * with an affine-mapped clip of the source. No app or DOM dependencies.
 */

export const WARP_SIZE = 4;

export function identity_mesh() {
	const mesh = [];
	for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) mesh.push({ x: c / 3, y: r / 3 });
	return mesh;
}

export function is_identity_mesh(mesh) {
	if (!Array.isArray(mesh) || mesh.length !== 16) return true;
	return identity_mesh().every((p, i) => Math.abs(p.x - mesh[i].x) < 1e-9 && Math.abs(p.y - mesh[i].y) < 1e-9);
}

export function valid_mesh(mesh) {
	return Array.isArray(mesh) && mesh.length === 16 && mesh.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y));
}

function bernstein(t) {
	const s = 1 - t;
	return [s * s * s, 3 * t * s * s, 3 * t * t * s, t * t * t];
}

/** Point on the patch for parameters u (across) and v (down), both 0..1. */
export function mesh_point(mesh, u, v) {
	const bu = bernstein(u), bv = bernstein(v);
	let x = 0, y = 0;
	for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
		const w = bv[r] * bu[c], p = mesh[r * 4 + c];
		x += w * p.x; y += w * p.y;
	}
	return { x, y };
}

/** (n+1)x(n+1) grid of normalised patch points. */
export function subdivide(mesh, n = 16) {
	const rows = [];
	for (let i = 0; i <= n; i++) {
		const row = [];
		for (let j = 0; j <= n; j++) row.push(mesh_point(mesh, j / n, i / n));
		rows.push(row);
	}
	return rows;
}

/** Affine [a,b,c,d,e,f] mapping source triangle s onto destination triangle d. */
export function triangle_affine(s, d) {
	const [s0, s1, s2] = s, [d0, d1, d2] = d;
	const den = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
	if (Math.abs(den) < 1e-12) return null;
	const a = ((d1.x - d0.x) * (s2.y - s0.y) - (d2.x - d0.x) * (s1.y - s0.y)) / den;
	const c = ((d2.x - d0.x) * (s1.x - s0.x) - (d1.x - d0.x) * (s2.x - s0.x)) / den;
	const b = ((d1.y - d0.y) * (s2.y - s0.y) - (d2.y - d0.y) * (s1.y - s0.y)) / den;
	const dd = ((d2.y - d0.y) * (s1.x - s0.x) - (d1.y - d0.y) * (s2.x - s0.x)) / den;
	return [a, b, c, dd, d0.x - a * s0.x - c * s0.y, d0.y - b * s0.x - dd * s0.y];
}

function grow(tri, amount) {
	const cx = (tri[0].x + tri[1].x + tri[2].x) / 3, cy = (tri[0].y + tri[1].y + tri[2].y) / 3;
	return tri.map(p => {
		const dx = p.x - cx, dy = p.y - cy, len = Math.hypot(dx, dy) || 1;
		return { x: p.x + dx / len * amount, y: p.y + dy / len * amount };
	});
}

/**
 * Draw source (canvas/image covering rect) warped by mesh into ctx, in the
 * ctx's current coordinate space. rect = {x, y, width, height} in that space.
 */
export function draw_warp(ctx, source, rect, mesh, n = 16) {
	const sw = source.width || source.naturalWidth, sh = source.height || source.naturalHeight;
	const grid = subdivide(mesh, n);
	const dst = p => ({ x: rect.x + p.x * rect.width, y: rect.y + p.y * rect.height });
	const t = ctx.getTransform ? ctx.getTransform() : null;
	const scale = t ? Math.max(1e-6, Math.hypot(t.a, t.b)) : 1;
	for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
		const s00 = { x: j / n * sw, y: i / n * sh }, s10 = { x: (j + 1) / n * sw, y: i / n * sh };
		const s01 = { x: j / n * sw, y: (i + 1) / n * sh }, s11 = { x: (j + 1) / n * sw, y: (i + 1) / n * sh };
		const d00 = dst(grid[i][j]), d10 = dst(grid[i][j + 1]), d01 = dst(grid[i + 1][j]), d11 = dst(grid[i + 1][j + 1]);
		for (const [s, d] of [[[s00, s10, s11], [d00, d10, d11]], [[s00, s11, s01], [d00, d11, d01]]]) {
			const m = triangle_affine(s, d);
			if (!m) continue;
			const clip = grow(d, 0.6 / scale);
			ctx.save();
			ctx.beginPath(); ctx.moveTo(clip[0].x, clip[0].y); ctx.lineTo(clip[1].x, clip[1].y); ctx.lineTo(clip[2].x, clip[2].y); ctx.closePath();
			ctx.clip();
			ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
			ctx.drawImage(source, 0, 0);
			ctx.restore();
		}
	}
}
