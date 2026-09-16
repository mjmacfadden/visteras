/**
 * Framework-agnostic font family loader for browser environments.
 * Uses FontFace / document.fonts — no Node APIs, no webfontloader required.
 */

import { inferFontSource, isSystemFontFamily } from './catalog.js';
import { findGoogleFontEntry } from './cache.js';
import { styleNameToCssWeight } from './weights.js';

/** @type {Map<string, Promise<boolean>>} */
const loading = new Map();
/** @type {Set<string>} */
const loaded = new Set();

/** Optional Local Font Access faces granted earlier by the host app. */
/** @type {Map<string, { blob: () => Promise<Blob> }>} */
const localFontDataByFamily = new Map();

/**
 * Register a Local Font Access FontData (or compatible { blob() }) for later load.
 * @param {string} family
 * @param {{ blob: () => Promise<Blob> }} fontData
 */
export function registerLocalFontData(family, fontData) {
	if (family && fontData && typeof fontData.blob === 'function') {
		localFontDataByFamily.set(family, fontData);
	}
}

/**
 * Clear in-memory load tracking (tests / hot reload).
 */
export function resetFontLoaderState() {
	loading.clear();
	loaded.clear();
}

/**
 * Convert Google API variant keys to CSS2 axis query parts.
 * @param {string[]} variants
 * @returns {string} e.g. "ital,wght@0,400;0,700;1,400"
 */
function variantsToCss2Axis(variants) {
	const list = (variants && variants.length) ? variants : ['regular'];
	const pairs = [];
	for (const raw of list) {
		const v = String(raw).toLowerCase();
		const italic = v.includes('italic');
		let weight = '400';
		if (v === 'regular' || v === 'italic') weight = '400';
		else {
			const m = v.match(/(\d{2,4})/);
			weight = m ? String(parseInt(m[1], 10)) : styleNameToCssWeight(v);
		}
		pairs.push(`${italic ? 1 : 0},${weight}`);
	}
	// Dedupe + sort
	const uniq = [...new Set(pairs)].sort();
	return `ital,wght@${uniq.join(';')}`;
}

/**
 * Inject Google Fonts CSS stylesheet and wait until the family is usable.
 * @param {string} family
 * @param {string[]|null} variants
 * @returns {Promise<boolean>}
 */
async function loadGoogleViaStylesheet(family, variants) {
	if (typeof document === 'undefined') return false;

	const axis = variantsToCss2Axis(variants);
	const familyParam = encodeURIComponent(family).replace(/%20/g, '+');
	const href = `https://fonts.googleapis.com/css2?family=${familyParam}:${axis}&display=swap`;

	const esc = (typeof CSS !== 'undefined' && CSS.escape)
		? CSS.escape(family)
		: family.replace(/["\\]/g, '\\$&');
	const existing = document.querySelector(`link[data-visteras-font="${esc}"]`);
	if (!existing) {
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = href;
		link.dataset.visterasFont = family;
		document.head.appendChild(link);
		// Wait for stylesheet to apply (link.onload + fonts.load)
		await new Promise((resolve) => {
			link.onload = () => resolve();
			link.onerror = () => resolve();
			// Fallback if onload never fires (cached)
			setTimeout(resolve, 1500);
		});
	}

	if (document.fonts && typeof document.fonts.load === 'function') {
		try {
			await document.fonts.load(`16px "${family}"`);
			if (typeof document.fonts.check === 'function' && document.fonts.check(`16px "${family}"`)) {
				return true;
			}
			// Still resolve success — browser may substitute until paint
			return true;
		} catch (e) {
			console.warn(`[visteras/fonts] document.fonts.load failed for ${family}`, e);
			return true;
		}
	}
	return true;
}

/**
 * Load via FontFace from a previously granted Local Font Access blob.
 * @param {string} family
 * @returns {Promise<boolean>}
 */
async function loadLocalGranted(family) {
	const fontData = localFontDataByFamily.get(family);
	if (!fontData) return false;
	try {
		const blob = await fontData.blob();
		const url = URL.createObjectURL(blob);
		const face = new FontFace(family, `url(${url})`);
		const loadedFace = await face.load();
		document.fonts.add(loadedFace);
		URL.revokeObjectURL(url);
		return true;
	} catch (e) {
		console.warn(`[visteras/fonts] local FontFace load failed for ${family}`, e);
		return false;
	}
}

/**
 * Load a font family so it is usable for canvas / SVG text.
 *
 * @param {{ family: string, source?: 'google'|'system'|'local', variants?: string[] }} opts
 * @returns {Promise<boolean>} resolves when the face is usable (or no-op success for generics)
 */
export async function loadFontFamily({ family, source, variants } = {}) {
	if (!family || typeof family !== 'string') return false;
	const name = family.trim();
	if (!name) return false;

	let src = source;
	if (!src) {
		const entry = findGoogleFontEntry(name);
		src = inferFontSource(name, {
			googleFamilies: entry ? [entry.family] : undefined,
		});
		// If host didn't mark system but name looks non-system, prefer google
		if (!isSystemFontFamily(name) && !entry) src = 'google';
	}

	const key = `${src}::${name}::${(variants || []).join(',')}`;
	if (loaded.has(key)) return true;
	if (loading.has(key)) return loading.get(key);

	const promise = (async () => {
		if (src === 'system' || src === 'local') {
			// Already available as a generic/system name?
			if (typeof document !== 'undefined' && document.fonts && typeof document.fonts.check === 'function') {
				try {
					if (document.fonts.check(`16px "${name}"`)) {
						loaded.add(key);
						return true;
					}
				} catch (e) { /* ignore */ }
			}
			if (localFontDataByFamily.has(name)) {
				const ok = await loadLocalGranted(name);
				if (ok) {
					loaded.add(key);
					return true;
				}
			}
			// Generics / OS fonts: no-op success (browser will use installed face or fallback)
			if (isSystemFontFamily(name) || src === 'system') {
				loaded.add(key);
				return true;
			}
			loaded.add(key);
			return true;
		}

		// google (default)
		const entry = findGoogleFontEntry(name);
		const vars = variants && variants.length
			? variants
			: (entry && entry.variants ? entry.variants.filter((v) => !/italic/i.test(v)).slice(0, 4) : ['regular', '700']);
		const ok = await loadGoogleViaStylesheet(name, vars);
		if (ok) loaded.add(key);
		return ok;
	})();

	loading.set(key, promise);
	try {
		return await promise;
	} finally {
		loading.delete(key);
	}
}
