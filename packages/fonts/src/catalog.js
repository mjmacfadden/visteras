/**
 * Shared default typeface list for Visteras Studio + Vector.
 * Order and names match Studio's historic config.FONTS (do not diverge).
 */

/** Generic / OS fonts that should not be fetched from Google. */
export const SYSTEM_FONT_FAMILIES = Object.freeze([
	'Arial',
	'Courier',
	'Impact',
	'Helvetica',
	'Monospace',
	'Tahoma',
	'Times New Roman',
	'Verdana',
]);

const SYSTEM_SET = new Set(SYSTEM_FONT_FAMILIES.map((f) => f.toLowerCase()));

/**
 * Default quick-picker catalog — same order/names as Studio config.FONTS.
 * @type {readonly string[]}
 */
export const DEFAULT_FONTS = Object.freeze([
	'Arial',
	'Courier',
	'Impact',
	'Helvetica',
	'Monospace',
	'Tahoma',
	'Times New Roman',
	'Verdana',
	'Amatic SC',
	'Arimo',
	'Codystar',
	'Creepster',
	'Indie Flower',
	'Lato',
	'Lora',
	'Merriweather',
	'Monoton',
	'Montserrat',
	'Mukta',
	'Muli',
	'Nosifer',
	'Nunito',
	'Oswald',
	'Orbitron',
	'Pacifico',
	'PT Sans',
	'PT Serif',
	'Playfair Display',
	'Poppins',
	'Raleway',
	'Roboto',
	'Rubik',
	'Special Elite',
	'Tangerine',
	'Titillium Web',
	'Ubuntu',
]);

export const DEFAULT_FONT_FAMILY = 'Roboto';

/**
 * @param {string} family
 * @returns {boolean}
 */
export function isSystemFontFamily(family) {
	if (!family) return false;
	return SYSTEM_SET.has(String(family).trim().toLowerCase());
}

/**
 * Infer load source for a family name.
 * @param {string} family
 * @param {{ googleFamilies?: Iterable<string> }} [opts]
 * @returns {'system' | 'google'}
 */
export function inferFontSource(family, opts = {}) {
	if (isSystemFontFamily(family)) return 'system';
	if (opts.googleFamilies) {
		const set = opts.googleFamilies instanceof Set
			? opts.googleFamilies
			: new Set([...opts.googleFamilies].map((f) => String(f).toLowerCase()));
		if (set.has(String(family).trim().toLowerCase())) return 'google';
	}
	// Non-system defaults are treated as Google web fonts (matches Studio behavior).
	return 'google';
}

/**
 * @returns {string[]}
 */
export function listDefaultFontFamilies() {
	return [...DEFAULT_FONTS];
}

/**
 * @param {{ family: string, category?: string, variants?: string[] }[] | null | undefined} cache
 * @returns {string[]}
 */
export function listGoogleCacheFamilies(cache) {
	if (!Array.isArray(cache)) return [];
	return cache.map((entry) => entry && entry.family).filter(Boolean);
}
