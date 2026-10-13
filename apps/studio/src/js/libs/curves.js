/** Pure Curves math. Points use ag-psd's { input, output } representation. */
export function default_curves_params() {
	const identity = () => [{ input: 0, output: 0 }, { input: 255, output: 255 }];
	return { channel: 'rgb', rgb: identity(), red: identity(), green: identity(), blue: identity() };
}

export function normalize_curve(points) {
	const unique = new Map();
	for (const p of points || []) {
		if (!Number.isFinite(p.input) || !Number.isFinite(p.output)) continue;
		unique.set(Math.max(0, Math.min(255, Math.round(p.input))), Math.max(0, Math.min(255, Math.round(p.output))));
	}
	const result = [...unique].sort((a, b) => a[0] - b[0]).map(([input, output]) => ({ input, output }));
	return result.length >= 2 ? result : default_curves_params().rgb;
}

/** Shape-preserving cubic Hermite interpolation (PCHIP). Local extrema have
 * zero slope; monotone segments never overshoot their anchors. Outside moved
 * endpoints, clamp to the endpoint output, like Photoshop's tonal controls. */
export function curves_lut(points) {
	const p = normalize_curve(points), n = p.length;
	const h = [], d = [], m = [];
	for (let i = 0; i < n - 1; i++) {
		h[i] = p[i + 1].input - p[i].input;
		d[i] = (p[i + 1].output - p[i].output) / h[i];
	}
	const endpoint = (h0, h1, d0, d1) => {
		let slope = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
		if (Math.sign(slope) !== Math.sign(d0)) slope = 0;
		else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(slope) > 3 * Math.abs(d0)) slope = 3 * d0;
		return slope;
	};
	m[0] = n === 2 ? d[0] : endpoint(h[0], h[1], d[0], d[1]);
	m[n - 1] = n === 2 ? d[0] : endpoint(h[n - 2], h[n - 3], d[n - 2], d[n - 3]);
	for (let i = 1; i < n - 1; i++) {
		if (d[i - 1] * d[i] <= 0) m[i] = 0;
		else {
			const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
			m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
		}
	}
	const lut = new Uint8Array(256);
	let segment = 0;
	for (let v = 0; v < 256; v++) {
		let out;
		if (v <= p[0].input) out = p[0].output;
		else if (v >= p[n - 1].input) out = p[n - 1].output;
		else {
			while (segment < n - 2 && v > p[segment + 1].input) segment++;
			const i = segment, t = (v - p[i].input) / h[i], t2 = t * t, t3 = t2 * t;
			out = (2*t3 - 3*t2 + 1)*p[i].output + (t3 - 2*t2 + t)*h[i]*m[i]
				+ (-2*t3 + 3*t2)*p[i + 1].output + (t3 - t2)*h[i]*m[i + 1];
		}
		lut[v] = Math.max(0, Math.min(255, Math.round(out)));
	}
	return lut;
}

export function compose_curves(params = {}) {
	const rgb = curves_lut(params.rgb), result = {};
	for (const [key, channel] of [['r', 'red'], ['g', 'green'], ['b', 'blue']]) {
		const lut = curves_lut(params[channel]);
		result[key] = Uint8Array.from(lut, v => rgb[v]);
	}
	return result;
}

export function apply_curves(data, params) {
	const { r, g, b } = compose_curves(params);
	for (let i = 0; i < data.length; i += 4) {
		if (!data[i + 3]) continue;
		data[i] = r[data[i]]; data[i + 1] = g[data[i + 1]]; data[i + 2] = b[data[i + 2]];
	}
	return data;
}

export function psd_curves_to_studio(adj = {}) {
	const params = default_curves_params();
	for (const ch of ['rgb', 'red', 'green', 'blue']) params[ch] = normalize_curve(adj[ch]);
	return params;
}

export function studio_curves_to_psd(params = {}) {
	const adjustment = { type: 'curves' };
	for (const ch of ['rgb', 'red', 'green', 'blue']) adjustment[ch] = normalize_curve(params[ch]);
	return adjustment;
}

export function migrate_psd_unsupported_curves(layer) {
	if (layer?.psd_unsupported?.type !== 'curves') return;
	layer.adjustment_type = 'curves';
	layer.params = psd_curves_to_studio(layer.psd_unsupported.raw || {});
	if (typeof layer.name === 'string') layer.name = layer.name.replace(/\s*\(unsupported\)$/i, '');
	delete layer.psd_unsupported;
}
