/**
 * Levels adjustment layer math, LUT generation, composition,
 * PSD conversion, and migration.
 *
 * Pure ESM module — no app or DOM imports.
 */

/**
 * Returns default Levels parameters for a new adjustment layer.
 * @returns {{channel: string, rgb: object, red: object, green: object, blue: object}}
 */
export function default_levels_params() {
	const defaultChannel = () => ({
		inBlack: 0,
		gamma: 1,
		inWhite: 255,
		outBlack: 0,
		outWhite: 255
	});

	return {
		channel: 'rgb',
		rgb: defaultChannel(),
		red: defaultChannel(),
		green: defaultChannel(),
		blue: defaultChannel()
	};
}

/**
 * Precomputes a 256-entry lookup table for a single Levels channel.
 *
 * Math:
 *   t = clamp((v - inBlack) / (inWhite - inBlack), 0, 1)
 *   t = t^(1 / gamma)
 *   out = round(outBlack + t * (outWhite - outBlack))
 *
 * @param {{inBlack?: number, gamma?: number, inWhite?: number, outBlack?: number, outWhite?: number}} [channelParams]
 * @returns {Uint8Array} 256-entry lookup table mapping 0..255 to 0..255
 */
export function levels_lut(channelParams) {
	const p = channelParams || {};
	const inBlack = p.inBlack !== undefined ? Number(p.inBlack) : 0;
	const inWhite = p.inWhite !== undefined ? Number(p.inWhite) : 255;
	let gamma = p.gamma !== undefined ? Number(p.gamma) : 1;
	if (!isFinite(gamma) || gamma <= 0) gamma = 1;
	const outBlack = p.outBlack !== undefined ? Number(p.outBlack) : 0;
	const outWhite = p.outWhite !== undefined ? Number(p.outWhite) : 255;

	const lut = new Uint8Array(256);
	const invGamma = 1 / gamma;
	const denom = inWhite - inBlack;

	for (let v = 0; v < 256; v++) {
		let t = denom !== 0 ? (v - inBlack) / denom : (v >= inWhite ? 1 : 0);
		if (t < 0) t = 0;
		else if (t > 1) t = 1;

		if (gamma !== 1) {
			t = Math.pow(t, invGamma);
		}

		const out = outBlack + t * (outWhite - outBlack);
		lut[v] = Math.max(0, Math.min(255, Math.round(out)));
	}
	return lut;
}

/**
 * Composes per-channel LUTs with composite RGB LUT in Photoshop order:
 * per-channel LUT first, then composite RGB LUT.
 *
 *   r[i] = rgbLut[redLut[i]]
 *   g[i] = rgbLut[greenLut[i]]
 *   b[i] = rgbLut[blueLut[i]]
 *
 * @param {object} params Levels parameters
 * @returns {{r: Uint8Array, g: Uint8Array, b: Uint8Array}}
 */
export function compose_levels(params) {
	const p = params || {};
	const rgbLut = levels_lut(p.rgb);
	const rChannelLut = levels_lut(p.red);
	const gChannelLut = levels_lut(p.green);
	const bChannelLut = levels_lut(p.blue);

	const r = new Uint8Array(256);
	const g = new Uint8Array(256);
	const b = new Uint8Array(256);

	for (let i = 0; i < 256; i++) {
		r[i] = rgbLut[rChannelLut[i]];
		g[i] = rgbLut[gChannelLut[i]];
		b[i] = rgbLut[bChannelLut[i]];
	}

	return { r, g, b };
}

/**
 * Applies Levels adjustment in-place to RGBA pixel buffer.
 *
 * @param {Uint8ClampedArray|Uint8Array} data RGBA pixel buffer
 * @param {object} params Levels parameters
 * @returns {Uint8ClampedArray|Uint8Array}
 */
export function apply_levels(data, params) {
	const { r, g, b } = compose_levels(params);
	const len = data.length;
	for (let i = 0; i < len; i += 4) {
		if (data[i + 3] === 0) continue;
		data[i] = r[data[i]];
		data[i + 1] = g[data[i + 1]];
		data[i + 2] = b[data[i + 2]];
	}
	return data;
}

/**
 * Calculates Auto Levels parameters by clipping a percentage of pixels at each end
 * per channel (default 0.1% = 0.001), matching Photoshop's default Auto Levels.
 *
 * @param {{red?: ArrayLike<number>, green?: ArrayLike<number>, blue?: ArrayLike<number>, r?: ArrayLike<number>, g?: ArrayLike<number>, b?: ArrayLike<number>}|ArrayLike<number>[]} histograms
 * @param {number} [clip=0.001]
 * @returns {object} Levels parameters
 */
export function auto_levels(histograms, clip = 0.001) {
	const result = default_levels_params();
	if (!histograms) return result;

	const rHist = histograms.red || histograms.r || (Array.isArray(histograms) ? histograms[0] : null);
	const gHist = histograms.green || histograms.g || (Array.isArray(histograms) ? histograms[1] : null);
	const bHist = histograms.blue || histograms.b || (Array.isArray(histograms) ? histograms[2] : null);

	const channels = [
		{ key: 'red', hist: rHist },
		{ key: 'green', hist: gHist },
		{ key: 'blue', hist: bHist }
	];

	for (const { key, hist } of channels) {
		if (!hist || hist.length < 256) continue;
		let total = 0;
		for (let i = 0; i < 256; i++) {
			total += hist[i];
		}
		if (total === 0) continue;

		const clipCount = Math.floor(total * clip);

		let inBlack = 0;
		let accumBlack = 0;
		for (let i = 0; i < 256; i++) {
			accumBlack += hist[i];
			if (accumBlack > clipCount) {
				inBlack = i;
				break;
			}
		}

		let inWhite = 255;
		let accumWhite = 0;
		for (let i = 255; i >= 0; i--) {
			accumWhite += hist[i];
			if (accumWhite > clipCount) {
				inWhite = i;
				break;
			}
		}

		inBlack = Math.max(0, Math.min(253, inBlack));
		inWhite = Math.max(2, Math.min(255, inWhite));
		if (inWhite <= inBlack) {
			inWhite = Math.min(255, inBlack + 2);
		}

		result[key] = {
			inBlack,
			gamma: 1,
			inWhite,
			outBlack: 0,
			outWhite: 255
		};
	}

	return result;
}

/**
 * Converts an ag-psd LevelsAdjustment object to Studio Levels params shape.
 *
 * @param {object} adj ag-psd LevelsAdjustment
 * @returns {object} Studio Levels params
 */
export function psd_levels_to_studio(adj) {
	const def = default_levels_params();
	if (!adj) return def;

	const convertChannel = (src) => {
		if (!src) return { inBlack: 0, gamma: 1, inWhite: 255, outBlack: 0, outWhite: 255 };
		let inBlack = src.shadowInput != null ? Number(src.shadowInput) : 0;
		let inWhite = src.highlightInput != null ? Number(src.highlightInput) : 255;
		let gamma = src.midtoneInput != null ? Number(src.midtoneInput) : 1;
		let outBlack = src.shadowOutput != null ? Number(src.shadowOutput) : 0;
		let outWhite = src.highlightOutput != null ? Number(src.highlightOutput) : 255;

		if (!isFinite(inBlack)) inBlack = 0;
		if (!isFinite(inWhite)) inWhite = 255;
		if (!isFinite(gamma) || gamma <= 0) gamma = 1;
		if (!isFinite(outBlack)) outBlack = 0;
		if (!isFinite(outWhite)) outWhite = 255;

		inBlack = Math.max(0, Math.min(253, Math.round(inBlack)));
		inWhite = Math.max(2, Math.min(255, Math.round(inWhite)));
		if (inWhite <= inBlack) {
			inWhite = Math.min(255, inBlack + 2);
		}
		gamma = Math.max(0.01, Math.min(9.99, parseFloat(gamma.toFixed(2))));
		outBlack = Math.max(0, Math.min(255, Math.round(outBlack)));
		outWhite = Math.max(0, Math.min(255, Math.round(outWhite)));

		return { inBlack, gamma, inWhite, outBlack, outWhite };
	};

	return {
		channel: 'rgb',
		rgb: convertChannel(adj.rgb),
		red: convertChannel(adj.red),
		green: convertChannel(adj.green),
		blue: convertChannel(adj.blue)
	};
}

/**
 * Converts Studio Levels params shape to an ag-psd LevelsAdjustment object.
 *
 * @param {object} params Studio Levels params
 * @returns {object} ag-psd LevelsAdjustment
 */
export function studio_levels_to_psd(params) {
	const p = params || {};
	const exportChannel = (src) => {
		const c = src || { inBlack: 0, gamma: 1, inWhite: 255, outBlack: 0, outWhite: 255 };
		return {
			shadowInput: Math.max(0, Math.min(253, Math.round(c.inBlack ?? 0))),
			highlightInput: Math.max(2, Math.min(255, Math.round(c.inWhite ?? 255))),
			midtoneInput: Number(parseFloat((c.gamma ?? 1).toFixed(2))),
			shadowOutput: Math.max(0, Math.min(255, Math.round(c.outBlack ?? 0))),
			highlightOutput: Math.max(0, Math.min(255, Math.round(c.outWhite ?? 255)))
		};
	};

	return {
		type: 'levels',
		rgb: exportChannel(p.rgb),
		red: exportChannel(p.red),
		green: exportChannel(p.green),
		blue: exportChannel(p.blue)
	};
}

/**
 * Migrates old .vsd placeholder layer (with psd_unsupported.type === 'levels')
 * into a real Levels adjustment layer.
 *
 * @param {object} layer
 */
export function migrate_psd_unsupported_levels(layer) {
	if (!layer || !layer.psd_unsupported) return;
	if (layer.psd_unsupported.type === 'levels') {
		const raw = layer.psd_unsupported.raw;
		layer.adjustment_type = 'levels';
		layer.params = psd_levels_to_studio(raw || {});
		if (layer.name && typeof layer.name === 'string') {
			layer.name = layer.name.replace(/\s*\(unsupported\)$/i, '');
		}
		delete layer.psd_unsupported;
	}
}
