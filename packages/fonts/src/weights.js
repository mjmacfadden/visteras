/**
 * Weight labeling helpers (ported from Studio font-manager.js).
 * Produce "Regular (400)" style labels and map style names → CSS numeric weights.
 */

const NAME_MAP = {
	'100': 'Thin', '200': 'ExtraLight', '300': 'Light', '400': 'Regular',
	'500': 'Medium', '600': 'SemiBold', '700': 'Bold', '800': 'ExtraBold', '900': 'Black',
	regular: 'Regular', normal: 'Regular',
	thin: 'Thin', hairline: 'Thin',
	extralight: 'ExtraLight', ultralight: 'ExtraLight',
	light: 'Light', medium: 'Medium',
	semibold: 'SemiBold', demibold: 'SemiBold', semi: 'SemiBold',
	bold: 'Bold',
	extrabold: 'ExtraBold', ultrabold: 'ExtraBold',
	black: 'Black', heavy: 'Black',
};

const CSS_MAP = {
	Thin: '100', ExtraLight: '200', Light: '300', Regular: '400',
	Medium: '500', SemiBold: '600', Bold: '700', ExtraBold: '800', Black: '900',
};

/**
 * Map Local Font Access / dropdown style labels to CSS numeric font-weight (100–900).
 * @param {string|null|undefined} styleName
 * @returns {string}
 */
export function styleNameToCssWeight(styleName) {
	if (styleName == null || styleName === '') return '400';
	const s = String(styleName).trim();
	const paren = s.match(/\((\d{2,4})\)/);
	if (paren) return String(parseInt(paren[1], 10));
	const base = s.replace(/\s*\(\d{2,4}\)\s*$/, '').trim();
	const bareNum = base.match(/^(\d{2,4})$/);
	if (bareNum) return String(parseInt(bareNum[1], 10));
	const w = base.toLowerCase().replace(/[\s_-]+/g, '').replace(/italic|oblique/g, '');
	if (!w || w === 'regular' || w === 'normal' || w === 'book' || w === 'roman') return '400';
	if (w === 'thin' || w === 'hairline') return '100';
	if (w === 'extralight' || w === 'ultralight') return '200';
	if (w === 'light') return '300';
	if (w === 'medium') return '500';
	if (w === 'semibold' || w === 'demibold' || w === 'semi') return '600';
	if (w === 'extrabold' || w === 'ultrabold') return '800';
	if (w === 'black' || w === 'heavy' || w === 'heavyblack') return '900';
	if (w === 'bold') return '700';
	if (w.includes('extralight') || w.includes('ultralight')) return '200';
	if (w.includes('thin') || w.includes('hairline')) return '100';
	if (w.includes('light')) return '300';
	if (w.includes('medium')) return '500';
	if (w.includes('semibold') || w.includes('demibold')) return '600';
	if (w.includes('extrabold') || w.includes('ultrabold')) return '800';
	if (w.includes('black') || w.includes('heavy')) return '900';
	if (w.includes('bold')) return '700';
	const embedded = base.match(/(\d{2,4})/);
	if (embedded) return String(parseInt(embedded[1], 10));
	return '400';
}

/**
 * Friendly Weight dropdown label with CSS numeric weight, e.g. "Light (300)".
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
export function formatWeightLabel(raw) {
	const s = String(raw == null ? '' : raw).trim();
	if (!s) return null;
	if (/^.+\s\(\d{2,4}\)$/.test(s)) return s;
	let base = s.replace(/\s*\(\d{2,4}\)\s*$/, '').trim();
	base = base.replace(/italic|oblique/ig, '').trim() || base;
	const key = base.toLowerCase().replace(/[\s_-]+/g, '');
	let name = NAME_MAP[key] || NAME_MAP[base];
	if (!name && /^\d{2,4}$/.test(key)) name = NAME_MAP[key];
	if (!name) {
		name = base.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bItalic\b/i, '').trim();
	}
	if (!name) return null;
	let num = null;
	const paren = s.match(/\((\d{2,4})\)/);
	const leading = base.match(/^(\d{2,4})$/);
	if (paren) num = paren[1];
	else if (leading) num = String(parseInt(leading[1], 10));
	else if (CSS_MAP[name]) num = CSS_MAP[name];
	else num = styleNameToCssWeight(name);
	return name + ' (' + num + ')';
}

/**
 * Strip " (400)" display suffix → "Regular" for Local Font Access matching.
 * @param {string|null|undefined} label
 * @returns {string}
 */
export function weightLabelBase(label) {
	if (label == null) return '';
	return String(label).replace(/\s*\(\d{2,4}\)\s*$/, '').trim();
}
