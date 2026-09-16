/**
 * Google Fonts metadata cache (bundled JSON). Browser-safe — no Node fs.
 */

import googleFontsCacheData from '../data/google-fonts-cache.json' with { type: 'json' };

/** @type {{ family: string, category?: string, variants?: string[] }[] | null} */
let _cache = Array.isArray(googleFontsCacheData) ? googleFontsCacheData : null;

/**
 * Return the bundled Google Fonts catalog (family + variants + category).
 * @returns {{ family: string, category?: string, variants?: string[] }[]}
 */
export function getGoogleFontsCache() {
	return Array.isArray(_cache) ? _cache : [];
}

/**
 * Allow hosts to inject/replace the cache (e.g. after a network refresh).
 * @param {{ family: string, category?: string, variants?: string[] }[] | null | undefined} data
 */
export function setGoogleFontsCache(data) {
	_cache = Array.isArray(data) ? data : null;
}

/**
 * Async getter for API symmetry with future remote loaders.
 * @returns {Promise<{ family: string, category?: string, variants?: string[] }[]>}
 */
export async function loadGoogleFontsCache() {
	return getGoogleFontsCache();
}

/**
 * @param {string} family
 * @returns {{ family: string, category?: string, variants?: string[] } | undefined}
 */
export function findGoogleFontEntry(family) {
	if (!family) return undefined;
	const want = String(family).trim().toLowerCase();
	return getGoogleFontsCache().find((f) => f && String(f.family).toLowerCase() === want);
}
