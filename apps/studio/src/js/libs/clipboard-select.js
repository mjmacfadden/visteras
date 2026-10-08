/**
 * Studio paste source selection: paste whatever was copied MOST RECENTLY.
 *
 * The system clipboard is the truth (any copy, in any app, overwrites it), so
 * it is read first. Studio's internal clipboard (lossless: position, alpha,
 * editable vectors) is used only when the system clipboard holds our own
 * latest copy (nonce / identical SVG / same-size image), when our copy never
 * reached the system clipboard, or when the system clipboard is empty or
 * unreadable. Stale Vector BroadcastChannel copies are a fallback only.
 * Pure helpers, no imports (unit tests load this file in a vm context).
 */

/** Web custom clipboard format carrying a copy stamp (Chromium; ignored elsewhere). */
export const CLIP_MIME = 'web application/x-visteras-clip+json';

/** {source, nonce, ts} identifying one copy. */
export function new_clip_stamp(source, now = Date.now(), rand = Math.random) {
	return { source, nonce: source + '-' + now.toString(36) + '-' + rand().toString(36).slice(2, 10), ts: now };
}

function root_tag(svgText) {
	const m = String(svgText || '').match(/<svg\b[^>]*>/i);
	return m ? m[0] : null;
}

function attr_of(tag, name) {
	const m = tag.match(new RegExp('\\s' + name + '\\s*=\\s*["\']([^"\']*)["\']', 'i'));
	return m ? m[1] : null;
}

/** Copy stamp written on an SVG root (data-visteras-clip / -copied / -source), or null. */
export function svg_clip_stamp(svgText) {
	const tag = root_tag(svgText);
	if (!tag) return null;
	const nonce = attr_of(tag, 'data-visteras-clip');
	if (!nonce) return null;
	const ts = Number(attr_of(tag, 'data-visteras-copied'));
	return { source: attr_of(tag, 'data-visteras-source') || 'studio', nonce, ts: Number.isFinite(ts) ? ts : 0 };
}

/** Write (or replace) the copy stamp on an SVG root. */
export function stamp_svg(svgText, stamp) {
	const tag = root_tag(svgText);
	if (!tag || !stamp) return svgText;
	const clean = tag.replace(/\s+data-visteras-(clip|copied)\s*=\s*["'][^"']*["']/gi, '');
	const next = clean.replace(/\s*(\/?)>$/, ` data-visteras-clip="${String(stamp.nonce).replace(/["<>&]/g, '')}" data-visteras-copied="${Number(stamp.ts) || 0}"$1>`);
	return String(svgText).replace(tag, next);
}

/** Stamp from the CLIP_MIME / Visteras vector JSON payload, or null. */
export function parse_clip_json(text) {
	if (!text) return null;
	try {
		const d = JSON.parse(text);
		if (!d || !d.nonce) return null;
		return { source: d.source || 'studio', nonce: String(d.nonce), ts: Number(d.ts) || 0 };
	} catch (e) {
		return null;
	}
}

/** First <svg>…</svg> in a text / html / svg string, or null. */
export function extract_svg(text) {
	if (!text || typeof text !== 'string') return null;
	const m = text.match(/<svg[\s\S]*<\/svg>/i);
	return m ? m[0] : null;
}

const strip_stamp = (svg) => String(svg || '').replace(/^\s*<\?xml[^>]*\?>\s*/, '')
	.replace(/\s+data-visteras-(clip|copied)\s*=\s*["'][^"']*["']/gi, '').trim();

/** Same SVG content, ignoring the XML prolog and copy stamp. */
export function same_svg(a, b) {
	return !!a && !!b && strip_stamp(extract_svg(a) || a) === strip_stamp(extract_svg(b) || b);
}

/**
 * Decide what ⌘V pastes.
 * @param {{
 *   system: {status:'ok'|'empty'|'unreadable', svg?:string|null, text?:string|null,
 *            image?:{width?:number,height?:number}|null, stamp?:{source:string,nonce:string,ts:number}|null},
 *   internal?: {kind:'raster'|'svg', nonce?:string, ts?:number, width?:number, height?:number,
 *               svg?:string, system_write?:'pending'|'ok'|'failed'}|null,
 *   cross?: {svg:string, nonce?:string, ts?:number}|null
 * }} o
 * @returns {{use:'internal'|'svg'|'image'|'text'|'none', svg?:string, reason:string}}
 */
export function choose_paste_source({ system, internal = null, cross = null }) {
	const sys = system || { status: 'unreadable' };
	const its = internal ? (internal.ts || 0) : -1;
	if (sys.status === 'ok') {
		const stamp = sys.stamp || null;
		if (internal && stamp && internal.nonce && stamp.nonce === internal.nonce) return { use: 'internal', reason: 'own-nonce' };
		if (internal && internal.kind === 'svg' && sys.svg && same_svg(sys.svg, internal.svg)) return { use: 'internal', reason: 'own-svg' };
		if (internal && internal.kind === 'raster' && sys.image && !sys.svg && !sys.text && !stamp
			&& sys.image.width === internal.width && sys.image.height === internal.height) {
			return { use: 'internal', reason: 'own-image' };
		}
		// Our latest copy never reached the system clipboard: it is newer than what is there,
		// unless the clipboard carries a Visteras copy stamped after it.
		if (internal && internal.system_write === 'failed' && !(stamp && stamp.ts > its)) {
			return { use: 'internal', reason: 'internal-not-on-clipboard' };
		}
		if (sys.svg) return { use: 'svg', svg: sys.svg, reason: stamp && stamp.source === 'vector' ? 'vector-copy' : (stamp ? 'visteras-copy' : 'foreign-svg') };
		if (sys.image) return { use: 'image', reason: 'foreign-image' };
		if (sys.text) return { use: 'text', reason: 'foreign-text' };
		return { use: 'none', reason: 'unsupported-content' };
	}
	// Empty / unreadable: newest of our own copies.
	if (cross && cross.svg && (cross.ts || 0) > its) return { use: 'svg', svg: cross.svg, reason: 'fallback-cross-app' };
	if (internal) return { use: 'internal', reason: 'fallback-internal' };
	return { use: 'none', reason: sys.status === 'empty' ? 'empty' : 'unreadable' };
}
