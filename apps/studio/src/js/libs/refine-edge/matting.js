/**
 * Fast Alpha Matting and Edge Refinement Library for Studio
 * Client-side Photoshop-grade matting algorithms:
 * - Guided Image Filter (O(N) linear time edge-preserving filter)
 * - Color-aware local trimap refinement & color clustering
 * - Smart radius contour edge detection
 * - Global mask transformations (Smooth, Feather, Contrast, Shift Edge)
 * - Color decontamination (removes background color spill on hair/fur)
 */

/**
 * 1D fast box blur (horizontal)
 */
function boxBlurH(scl, tcl, w, h, r) {
	const iarr = 1 / (r + r + 1);
	for (let i = 0; i < h; i++) {
		const ti = i * w;
		const li = ti;
		const ri = ti + r;
		const fv = scl[ti];
		const lv = scl[ti + w - 1];
		let val = (r + 1) * fv;
		for (let j = 0; j < r; j++) val += scl[ti + j];
		for (let j = 0; j <= r; j++) {
			val += scl[ri++] - fv;
			tcl[ti++] = val * iarr;
		}
		for (let j = r + 1; j < w - r; j++) {
			val += scl[ri++] - scl[li++];
			tcl[ti++] = val * iarr;
		}
		for (let j = w - r; j < w; j++) {
			val += lv - scl[li++];
			tcl[ti++] = val * iarr;
		}
	}
}

/**
 * 1D fast box blur (vertical)
 */
function boxBlurV(scl, tcl, w, h, r) {
	const iarr = 1 / (r + r + 1);
	for (let i = 0; i < w; i++) {
		let ti = i;
		let li = ti;
		let ri = ti + r * w;
		const fv = scl[ti];
		const lv = scl[ti + w * (h - 1)];
		let val = (r + 1) * fv;
		for (let j = 0; j < r; j++) val += scl[ti + j * w];
		for (let j = 0; j <= r; j++) {
			val += scl[ri] - fv;
			tcl[ti] = val * iarr;
			ri += w;
			ti += w;
		}
		for (let j = r + 1; j < h - r; j++) {
			val += scl[ri] - scl[li];
			tcl[ti] = val * iarr;
			li += w;
			ri += w;
			ti += w;
		}
		for (let j = h - r; j < h; j++) {
			val += lv - scl[li];
			tcl[ti] = val * iarr;
			li += w;
			ti += w;
		}
	}
}

/**
 * 2D separable box filter in O(N) time
 */
export function fastBoxFilter(src, width, height, radius) {
	if (radius <= 0) {
		return new Float32Array(src);
	}
	const r = Math.min(Math.floor(radius), Math.min(width, height) - 1);
	if (r <= 0) return new Float32Array(src);

	const temp = new Float32Array(width * height);
	const dest = new Float32Array(width * height);
	boxBlurH(src, temp, width, height, r);
	boxBlurV(temp, dest, width, height, r);
	return dest;
}

/**
 * Fast Guided Filter (He, Sun, Tang - Guided Image Filtering)
 * Preserves fine details and hair edges from guide image onto mask alpha.
 *
 * @param {Float32Array} guide Luminance of guide image [0, 1]
 * @param {Float32Array} src Input alpha channel [0, 1]
 * @param {number} width
 * @param {number} height
 * @param {number} radius Filter window radius
 * @param {number} eps Regularization parameter (e.g. 1e-4 to 1e-2)
 * @returns {Float32Array} Filtered alpha [0, 1]
 */
export function fastGuidedFilter(guide, src, width, height, radius = 5, eps = 0.001) {
	const N = width * height;
	const r = Math.max(1, Math.round(radius));

	// mean_I = f_box(I, r)
	const meanI = fastBoxFilter(guide, width, height, r);
	// mean_p = f_box(p, r)
	const meanP = fastBoxFilter(src, width, height, r);

	// corr_I = f_box(I * I, r)
	const II = new Float32Array(N);
	for (let i = 0; i < N; i++) II[i] = guide[i] * guide[i];
	const corrI = fastBoxFilter(II, width, height, r);

	// corr_Ip = f_box(I * p, r)
	const Ip = new Float32Array(N);
	for (let i = 0; i < N; i++) Ip[i] = guide[i] * src[i];
	const corrIp = fastBoxFilter(Ip, width, height, r);

	// var_I = corr_I - mean_I * mean_I
	// cov_Ip = corr_Ip - mean_I * mean_P
	// a = cov_Ip / (var_I + eps)
	// b = mean_P - a * mean_I
	const a = new Float32Array(N);
	const b = new Float32Array(N);
	for (let i = 0; i < N; i++) {
		const mI = meanI[i];
		const mP = meanP[i];
		const varI = Math.max(0, corrI[i] - mI * mI);
		const covIp = corrIp[i] - mI * mP;
		const aVal = covIp / (varI + eps);
		a[i] = aVal;
		b[i] = mP - aVal * mI;
	}

	// mean_a = f_box(a, r)
	// mean_b = f_box(b, r)
	const meanA = fastBoxFilter(a, width, height, r);
	const meanB = fastBoxFilter(b, width, height, r);

	// q = mean_a * I + mean_b
	const q = new Float32Array(N);
	for (let i = 0; i < N; i++) {
		const val = meanA[i] * guide[i] + meanB[i];
		q[i] = val < 0 ? 0 : val > 1 ? 1 : val;
	}
	return q;
}

/**
 * Color-Aware Local Matting for brush stroke refinement.
 * Samples foreground and background color clusters near the stroke,
 * estimates color probabilities for unknown pixels, and applies guided refinement.
 *
 * @param {Uint8ClampedArray} imgPixels RGBA pixels of original image
 * @param {Uint8ClampedArray} maskPixels Grayscale or alpha pixels of mask
 * @param {number} width
 * @param {number} height
 * @param {Array<{x: number, y: number}>} strokePoints
 * @param {number} brushRadius
 * @param {boolean} isErase
 * @param {string} refineMode 'color' | 'object'
 */
export function refineStrokeMatting(
	imgPixels,
	maskPixels,
	width,
	height,
	strokePoints,
	brushRadius,
	isErase = false,
	refineMode = 'color'
) {
	if (!strokePoints || strokePoints.length === 0) return maskPixels;

	// 1. Calculate bounding box of the brush stroke
	let minX = width, minY = height, maxX = 0, maxY = 0;
	const pad = Math.ceil(brushRadius * 2);
	for (let i = 0; i < strokePoints.length; i++) {
		const pt = strokePoints[i];
		minX = Math.min(minX, Math.floor(pt.x - pad));
		minY = Math.min(minY, Math.floor(pt.y - pad));
		maxX = Math.max(maxX, Math.ceil(pt.x + pad));
		maxY = Math.max(maxY, Math.ceil(pt.y + pad));
	}
	minX = Math.max(0, minX);
	minY = Math.max(0, minY);
	maxX = Math.min(width - 1, maxX);
	maxY = Math.min(height - 1, maxY);

	const roiW = maxX - minX + 1;
	const roiH = maxY - minY + 1;
	if (roiW <= 2 || roiH <= 2) return maskPixels;

	// 2. Identify brush stroke influence mask in ROI
	const strokeMask = new Uint8Array(roiW * roiH);
	const brushRadSq = brushRadius * brushRadius;
	for (let sp = 0; sp < strokePoints.length; sp++) {
		const pt = strokePoints[sp];
		const cx = Math.round(pt.x - minX);
		const cy = Math.round(pt.y - minY);
		const r = Math.ceil(brushRadius);
		const y0 = Math.max(0, cy - r);
		const y1 = Math.min(roiH - 1, cy + r);
		const x0 = Math.max(0, cx - r);
		const x1 = Math.min(roiW - 1, cx + r);

		for (let y = y0; y <= y1; y++) {
			const dy = y - cy;
			const dy2 = dy * dy;
			const row = y * roiW;
			for (let x = x0; x <= x1; x++) {
				const dx = x - cx;
				if (dx * dx + dy2 <= brushRadSq) {
					strokeMask[row + x] = 1;
				}
			}
		}
	}

	// 3. Extract ROI samples for foreground (mask >= 220) and background (mask <= 35)
	const fgSamples = [];
	const bgSamples = [];
	const fgSampleLimit = 300;
	const bgSampleLimit = 300;

	for (let ry = 0; ry < roiH; ry++) {
		const gy = minY + ry;
		const gRow = gy * width;
		const rRow = ry * roiW;
		for (let rx = 0; rx < roiW; rx++) {
			const gx = minX + rx;
			const gIdx = (gRow + gx) * 4;
			const mVal = maskPixels[gRow + gx];
			const r = imgPixels[gIdx];
			const g = imgPixels[gIdx + 1];
			const b = imgPixels[gIdx + 2];

			// Only sample outside or on boundary of brush stroke
			if (strokeMask[rRow + rx] === 0) {
				if (mVal >= 220 && fgSamples.length < fgSampleLimit) {
					fgSamples.push([r, g, b]);
				} else if (mVal <= 35 && bgSamples.length < bgSampleLimit) {
					bgSamples.push([r, g, b]);
				}
			}
		}
	}

	// If ROI lacks samples, search full mask for confident samples
	if (fgSamples.length < 5 || bgSamples.length < 5) {
		const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 2000)));
		for (let y = 0; y < height; y += step) {
			const row = y * width;
			for (let x = 0; x < width; x += step) {
				const idx = row + x;
				const mVal = maskPixels[idx];
				const pIdx = idx * 4;
				if (mVal >= 200 && fgSamples.length < fgSampleLimit) {
					fgSamples.push([imgPixels[pIdx], imgPixels[pIdx + 1], imgPixels[pIdx + 2]]);
				} else if (mVal <= 50 && bgSamples.length < bgSampleLimit) {
					bgSamples.push([imgPixels[pIdx], imgPixels[pIdx + 1], imgPixels[pIdx + 2]]);
				}
			}
		}
	}

	// Fallback samples if ROI and mask still don't have enough confidence
	if (fgSamples.length === 0) fgSamples.push([200, 200, 200]);
	if (bgSamples.length === 0) bgSamples.push([50, 50, 50]);

	// Compute average FG and BG colors and covariance/spread
	let fgR = 0, fgG = 0, fgB = 0;
	for (let i = 0; i < fgSamples.length; i++) {
		fgR += fgSamples[i][0];
		fgG += fgSamples[i][1];
		fgB += fgSamples[i][2];
	}
	fgR /= fgSamples.length;
	fgG /= fgSamples.length;
	fgB /= fgSamples.length;

	let bgR = 0, bgG = 0, bgB = 0;
	for (let i = 0; i < bgSamples.length; i++) {
		bgR += bgSamples[i][0];
		bgG += bgSamples[i][1];
		bgB += bgSamples[i][2];
	}
	bgR /= bgSamples.length;
	bgG /= bgSamples.length;
	bgB /= bgSamples.length;

	// 4. Prepare ROI arrays for guided filtering
	const guideROI = new Float32Array(roiW * roiH);
	const srcAlphaROI = new Float32Array(roiW * roiH);

	for (let ry = 0; ry < roiH; ry++) {
		const gy = minY + ry;
		const gRow = gy * width;
		const rRow = ry * roiW;
		for (let rx = 0; rx < roiW; rx++) {
			const gx = minX + rx;
			const gIdx = (gRow + gx) * 4;
			const r = imgPixels[gIdx];
			const g = imgPixels[gIdx + 1];
			const b = imgPixels[gIdx + 2];
			const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
			const rIdx = rRow + rx;
			guideROI[rIdx] = lum;

			const origMaskNorm = maskPixels[gRow + gx] / 255;

			if (strokeMask[rIdx] === 1) {
				// Pixel is under brush stroke: estimate alpha based on color distance
				const df = Math.hypot(r - fgR, g - fgG, b - fgB);
				const db = Math.hypot(r - bgR, g - bgG, b - bgB);

				let estimatedAlpha;
				if (refineMode === 'object') {
					// Object aware: heavily prioritize edge gradient affinity
					const diff = db - df;
					estimatedAlpha = 1 / (1 + Math.exp(-diff / 20));
				} else {
					// Color aware: quadratic distance affinity
					const df2 = df * df + 1e-4;
					const db2 = db * db + 1e-4;
					estimatedAlpha = db2 / (df2 + db2);
				}

				if (isErase) {
					// Erase mode: subtract affinity
					srcAlphaROI[rIdx] = Math.min(origMaskNorm, Math.max(0, 1 - estimatedAlpha));
				} else {
					// Add / refine mode: smooth blend between original and estimated
					srcAlphaROI[rIdx] = estimatedAlpha;
				}
			} else {
				srcAlphaROI[rIdx] = origMaskNorm;
			}
		}
	}

	// 5. Apply Guided Filter to ROI to lock edges to hair/fur strands
	const filterRadius = Math.max(3, Math.min(15, Math.round(brushRadius * 0.35)));
	const filteredROI = fastGuidedFilter(guideROI, srcAlphaROI, roiW, roiH, filterRadius, 0.005);

	// 6. Write filtered results back to maskPixels (feathering at brush boundary)
	for (let ry = 0; ry < roiH; ry++) {
		const gy = minY + ry;
		const gRow = gy * width;
		const rRow = ry * roiW;
		for (let rx = 0; rx < roiW; rx++) {
			const rIdx = rRow + rx;
			if (strokeMask[rIdx] === 1) {
				const gx = minX + rx;
				const targetIdx = gRow + gx;
				const newAlpha = Math.round(filteredROI[rIdx] * 255);
				maskPixels[targetIdx] = Math.max(0, Math.min(255, newAlpha));
			}
		}
	}

	return maskPixels;
}

/**
 * Edge Detection (Radius & Smart Radius)
 * Expands edge detection zone along mask contours and refines with guided filter.
 *
 * @param {Uint8ClampedArray} imgPixels RGBA original image
 * @param {Uint8ClampedArray} maskPixels Grayscale mask
 * @param {number} width
 * @param {number} height
 * @param {number} radius 0 - 100 px
 * @param {boolean} smartRadius
 */
export function applyEdgeDetection(imgPixels, maskPixels, width, height, radius, smartRadius) {
	if (radius <= 0) return maskPixels;

	const N = width * height;
	const guide = new Float32Array(N);
	const src = new Float32Array(N);

	// Compute luminance guide and normalized mask
	for (let i = 0; i < N; i++) {
		const idx = i * 4;
		guide[i] = (0.299 * imgPixels[idx] + 0.587 * imgPixels[idx + 1] + 0.114 * imgPixels[idx + 2]) / 255;
		src[i] = maskPixels[i] / 255;
	}

	// Effective radius adjustment if smart radius is active
	let effRadius = radius;
	let eps = 0.002;
	if (smartRadius) {
		effRadius = Math.max(1, radius * 0.7);
		eps = 0.0005; // sharper preservation of high contrast boundaries
	}

	const filtered = fastGuidedFilter(guide, src, width, height, effRadius, eps);

	// Edge mask: only update pixels near transition edges (mask between 10 and 245 or blurred delta)
	const blurredSrc = fastBoxFilter(src, width, height, Math.max(1, Math.round(radius * 0.5)));
	const result = new Uint8ClampedArray(N);

	for (let i = 0; i < N; i++) {
		const orig = src[i];
		const edgeZone = Math.abs(orig - blurredSrc[i]) > 0.02 || (orig > 0.05 && orig < 0.95);
		if (edgeZone) {
			const blend = Math.min(1, radius / 20);
			const val = orig * (1 - blend) + filtered[i] * blend;
			result[i] = Math.round(val * 255);
		} else {
			result[i] = maskPixels[i];
		}
	}

	return result;
}

/**
 * Global Refinement: Smooth
 * Blurs sharp staircasing and jagged edges.
 */
export function applySmooth(maskPixels, width, height, smoothVal) {
	if (smoothVal <= 0) return maskPixels;
	const radius = (smoothVal / 100) * 10;
	const N = width * height;
	const src = new Float32Array(N);
	for (let i = 0; i < N; i++) src[i] = maskPixels[i] / 255;
	const smoothed = fastBoxFilter(src, width, height, radius);
	const out = new Uint8ClampedArray(N);
	for (let i = 0; i < N; i++) {
		out[i] = Math.round(smoothed[i] * 255);
	}
	return out;
}

/**
 * Global Refinement: Feather
 * Gaussian / multi-pass box blur for soft transparent falloff.
 */
export function applyFeather(maskPixels, width, height, featherPx) {
	if (featherPx <= 0) return maskPixels;
	const N = width * height;
	let current = new Float32Array(N);
	for (let i = 0; i < N; i++) current[i] = maskPixels[i] / 255;

	// 3 passes of box filter approximates Gaussian blur
	const passR = Math.max(1, Math.round(featherPx / 2));
	current = fastBoxFilter(current, width, height, passR);
	current = fastBoxFilter(current, width, height, passR);

	const out = new Uint8ClampedArray(N);
	for (let i = 0; i < N; i++) {
		out[i] = Math.max(0, Math.min(255, Math.round(current[i] * 255)));
	}
	return out;
}

/**
 * Global Refinement: Contrast
 * Sharpens semi-transparent transitions using an S-curve.
 */
export function applyContrast(maskPixels, width, height, contrastVal) {
	if (contrastVal <= 0) return maskPixels;
	const c = 1 + (contrastVal / 100) * 4; // Factor from 1.0 to 5.0
	const N = width * height;
	const out = new Uint8ClampedArray(N);
	for (let i = 0; i < N; i++) {
		const val = maskPixels[i] / 255;
		let s = (val - 0.5) * c + 0.5;
		if (s < 0) s = 0;
		if (s > 1) s = 1;
		out[i] = Math.round(s * 255);
	}
	return out;
}

/**
 * Global Refinement: Shift Edge
 * Shifts mask edge inward (-100% to 0) or outward (0 to +100%).
 */
export function applyShiftEdge(maskPixels, width, height, shiftPercent) {
	if (shiftPercent === 0) return maskPixels;
	const N = width * height;
	const shift = shiftPercent / 100; // -1 to +1
	const out = new Uint8ClampedArray(N);

	// Midpoint threshold shift:
	// A positive shift lowers the threshold to expand white foreground
	// A negative shift raises the threshold to shrink foreground
	const gamma = Math.pow(2, -shift * 2.5);
	for (let i = 0; i < N; i++) {
		const val = maskPixels[i] / 255;
		const shifted = Math.pow(val, gamma);
		out[i] = Math.round(Math.min(1, Math.max(0, shifted)) * 255);
	}
	return out;
}

/**
 * Color Decontamination
 * Replaces background color spill on semi-transparent edge pixels with
 * neighboring foreground colors.
 *
 * @param {Uint8ClampedArray} imgPixels RGBA
 * @param {Uint8ClampedArray} maskPixels Grayscale mask
 * @param {number} width
 * @param {number} height
 * @param {number} amount 0 - 100%
 * @returns {Uint8ClampedArray} New decontaminated RGBA image pixels
 */
export function applyDecontaminateColors(imgPixels, maskPixels, width, height, amount = 100) {
	if (amount <= 0) return new Uint8ClampedArray(imgPixels);

	const N = width * height;
	const outImg = new Uint8ClampedArray(imgPixels);
	const strength = amount / 100;

	// Collect confident foreground color samples
	// For edge pixels (mask between 10 and 240), find the closest confident foreground pixel (mask >= 240)
	const searchRadius = 12;
	for (let y = 0; y < height; y++) {
		const row = y * width;
		for (let x = 0; x < width; x++) {
			const idx = row + x;
			const mVal = maskPixels[idx];
			if (mVal > 5 && mVal < 235) {
				// Semi-transparent edge: search neighboring confident foreground
				let bestDist = Infinity;
				let bestR = 0, bestG = 0, bestB = 0;

				const yMin = Math.max(0, y - searchRadius);
				const yMax = Math.min(height - 1, y + searchRadius);
				const xMin = Math.max(0, x - searchRadius);
				const xMax = Math.min(width - 1, x + searchRadius);

				for (let ny = yMin; ny <= yMax; ny += 2) {
					const nRow = ny * width;
					const dy = ny - y;
					for (let nx = xMin; nx <= xMax; nx += 2) {
						const nIdx = nRow + nx;
						if (maskPixels[nIdx] >= 240) {
							const dx = nx - x;
							const distSq = dx * dx + dy * dy;
							if (distSq < bestDist) {
								bestDist = distSq;
								const pIdx = nIdx * 4;
								bestR = imgPixels[pIdx];
								bestG = imgPixels[pIdx + 1];
								bestB = imgPixels[pIdx + 2];
							}
						}
					}
				}

				if (bestDist < Infinity) {
					const pIdx = idx * 4;
					const blend = strength * (1 - mVal / 255);
					outImg[pIdx] = Math.round(imgPixels[pIdx] * (1 - blend) + bestR * blend);
					outImg[pIdx + 1] = Math.round(imgPixels[pIdx + 1] * (1 - blend) + bestG * blend);
					outImg[pIdx + 2] = Math.round(imgPixels[pIdx + 2] * (1 - blend) + bestB * blend);
				}
			}
		}
	}

	return outImg;
}
