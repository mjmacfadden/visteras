/**
 * Select ▸ Modify helpers (Feather / Smooth / Border) on single-channel 8-bit
 * selection masks (Uint8 arrays, 0 = unselected, 255 = selected).
 * Pure functions, no DOM, so they are unit-testable.
 */

/** Mask canvas RGBA → one channel (max of red and alpha, like expand_mask). */
export function rgba_to_alpha(data) {
	const N = data.length >> 2;
	const out = new Uint8ClampedArray(N);
	for (let i = 0, p = 0; i < N; i++, p += 4) out[i] = Math.max(data[p], data[p + 3]);
	return out;
}

/** One channel → mask canvas RGBA (grey premultiplied form set_mask_canvas expects). */
export function alpha_to_rgba(alpha, target) {
	const out = target || new Uint8ClampedArray(alpha.length * 4);
	for (let i = 0, p = 0; i < alpha.length; i++, p += 4) {
		const v = alpha[i];
		out[p] = v; out[p + 1] = v; out[p + 2] = v; out[p + 3] = v;
	}
	return out;
}

function box_pass(src, dst, W, H, r, horizontal) {
	const n = horizontal ? W : H, lines = horizontal ? H : W;
	const step = horizontal ? 1 : W, lineStep = horizontal ? W : 1;
	const div = 2 * r + 1;
	for (let l = 0; l < lines; l++) {
		const base = l * lineStep;
		const at = (k) => src[base + Math.min(n - 1, Math.max(0, k)) * step];
		let sum = 0;
		for (let k = -r; k <= r; k++) sum += at(k);
		for (let k = 0; k < n; k++) {
			dst[base + k * step] = sum / div;
			sum += at(k + r + 1) - at(k - r);
		}
	}
}

/**
 * Feather: Gaussian-like blur (3 box passes per axis) with edge clamping, so a
 * selection that touches the canvas edge stays solid there, as in Photoshop.
 * Photoshop's Feather Radius is roughly the Gaussian sigma; three boxes of
 * radius r give sigma ≈ sqrt(3 * ((2r+1)^2 - 1) / 12).
 */
export function feather_alpha(alpha, W, H, radius) {
	const rad = Number(radius) || 0;
	if (rad <= 0) return Uint8ClampedArray.from(alpha);
	const r = Math.max(1, Math.round((Math.sqrt(4 * rad * rad + 1) - 1) / 2));
	let a = Float32Array.from(alpha), b = new Float32Array(alpha.length);
	for (let pass = 0; pass < 3; pass++) {
		box_pass(a, b, W, H, r, true); [a, b] = [b, a];
		box_pass(a, b, W, H, r, false); [a, b] = [b, a];
	}
	const out = new Uint8ClampedArray(alpha.length);
	for (let i = 0; i < out.length; i++) out[i] = Math.round(a[i]);
	return out;
}

/**
 * Smooth: majority filter over a (2r+1)² window. Removes specks and stray
 * pixels and rounds off jagged corners, like Photoshop's Select ▸ Modify ▸ Smooth.
 */
export function smooth_alpha(alpha, W, H, radius) {
	const r = Math.max(0, Math.round(Number(radius) || 0));
	if (r === 0) return Uint8ClampedArray.from(alpha);
	const IW = W + 1;
	const integral = new Uint32Array(IW * (H + 1));
	for (let y = 0; y < H; y++) {
		let rowSum = 0;
		for (let x = 0; x < W; x++) {
			rowSum += alpha[y * W + x] >= 128 ? 1 : 0;
			integral[(y + 1) * IW + x + 1] = integral[y * IW + x + 1] + rowSum;
		}
	}
	const out = new Uint8ClampedArray(alpha.length);
	for (let y = 0; y < H; y++) {
		const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
		for (let x = 0; x < W; x++) {
			const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
			const count = integral[y1 * IW + x1] - integral[y0 * IW + x1] - integral[y1 * IW + x0] + integral[y0 * IW + x0];
			const area = (x1 - x0) * (y1 - y0);
			out[y * W + x] = count * 2 > area ? 255 : (count * 2 === area ? (alpha[y * W + x] >= 128 ? 255 : 0) : 0);
		}
	}
	return out;
}

/** Split a Border width into the outward and inward parts (band centred on the edge). */
export function border_split(width) {
	const w = Math.max(1, Math.round(Number(width) || 0));
	return { out: Math.ceil(w / 2), in: Math.floor(w / 2) };
}

/** Border band = expanded mask minus contracted mask. */
export function border_alpha(expanded, contracted) {
	const out = new Uint8ClampedArray(expanded.length);
	for (let i = 0; i < out.length; i++) out[i] = Math.min(expanded[i], 255 - contracted[i]);
	return out;
}
