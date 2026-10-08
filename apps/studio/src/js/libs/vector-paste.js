/**
 * Visteras Vector -> Studio paste (Illustrator -> Photoshop "Paste as Smart Object").
 *
 * A Vector copy arrives as ONE Smart Layer whose embedded source document holds
 * the copied SVG group (data:image/svg+xml image layer), rendered 1:1, placed
 * centered in the visible part of the canvas. Pure helpers, no imports, so the
 * unit tests can load this file in a vm context.
 */

/**
 * True for the clipboard SVG written by Vector's copy bridge. Any of three
 * markers counts, so one surviving a clipboard sanitizer is enough: the root
 * data-visteras-source="vector", the root class "visteras-vector-clip", or
 * Vector's normalized copy group (data-visteras-copy-group).
 */
export function is_visteras_vector_svg(svgText) {
	if (!svgText || typeof svgText !== 'string') return false;
	const m = svgText.match(/<svg\b[^>]*>/i);
	if (!m) return false;
	if (/\bdata-visteras-source\s*=\s*["']vector["']/i.test(m[0])) return true;
	const cls = m[0].match(/\sclass\s*=\s*["']([^"']*)["']/i);
	if (cls && /(^|\s)visteras-vector-clip(\s|$)/.test(cls[1])) return true;
	return /<g\b[^>]*\bdata-visteras-copy-group\s*=/i.test(svgText);
}

/** Add the Vector marker to an SVG root (when only a side channel said it came from Vector). */
export function mark_vector_svg(svgText) {
	if (!svgText || is_visteras_vector_svg(svgText)) return svgText;
	return String(svgText).replace(/<svg\b/i, '<svg data-visteras-source="vector"');
}

/**
 * Pick the SVG to paste from every clipboard representation. text/plain is
 * preferred (browsers never sanitize it; Chrome re-serializes image/svg+xml and
 * hides it from paste events). Any Vector-marked representation wins, and a
 * Vector side channel (web custom format / JSON with source "vector") marks the
 * pick, so a Vector copy always reaches the smart-object paste.
 * @param {{plain?:string, svg?:string, html?:string, json?:string|string[]}} reps
 * @returns {string|null}
 */
export function pick_clipboard_svg({ plain = '', svg = '', html = '', json = [] } = {}) {
	const extract = (t) => {
		if (!t || typeof t !== 'string') return null;
		const m = t.match(/<svg[\s\S]*<\/svg>/i);
		return m ? m[0] : null;
	};
	const cands = [plain, svg, html].map(extract).filter(Boolean);
	let from_vector = false;
	for (const text of [].concat(json || [])) {
		if (!text) continue;
		try {
			const d = JSON.parse(text);
			if (!d) continue;
			if (d.source === 'vector') from_vector = true;
			const inner = extract(d.svg);
			if (inner) cands.push(inner);
		} catch (e) { /* not JSON */ }
	}
	const marked = cands.find(is_visteras_vector_svg);
	if (marked) return marked;
	if (!cands.length) return null;
	return from_vector ? mark_vector_svg(cands[0]) : cands[0];
}

/** Pixel size of an SVG document: width/height attributes, else the viewBox. */
export function svg_pixel_size(svgText) {
	const m = String(svgText || '').match(/<svg\b[^>]*>/i);
	if (!m) return null;
	const tag = m[0];
	const attr = (name) => {
		const a = tag.match(new RegExp('\\s' + name + '\\s*=\\s*["\']([^"\']*)["\']', 'i'));
		return a ? a[1] : null;
	};
	const len = (v) => {
		if (v == null || /%/.test(v)) return NaN;
		const n = parseFloat(v);
		return Number.isFinite(n) && n > 0 ? n : NaN;
	};
	let width = len(attr('width')), height = len(attr('height'));
	const vb = String(attr('viewBox') || '').trim().split(/[\s,]+/).map(Number);
	if (vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) {
		if (!Number.isFinite(width) && !Number.isFinite(height)) { width = vb[2]; height = vb[3]; }
		else if (!Number.isFinite(width)) width = height * vb[2] / vb[3];
		else if (!Number.isFinite(height)) height = width * vb[3] / vb[2];
	}
	if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
	return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}

/** Part of the document visible in the viewport (world px), or the whole document. */
export function visible_document_rect(doc_width, doc_height, view) {
	const doc = { x: 0, y: 0, width: doc_width, height: doc_height };
	if (!view || ![view.x, view.y, view.width, view.height].every(Number.isFinite)) return doc;
	const x0 = Math.max(0, view.x), y0 = Math.max(0, view.y);
	const x1 = Math.min(doc_width, view.x + view.width), y1 = Math.min(doc_height, view.y + view.height);
	if (x1 - x0 < 1 || y1 - y0 < 1) return doc;
	return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * Photoshop paste placement: centered on the visible part of the canvas, at
 * 1:1 pixel size. Only absurd content (over max_factor x the canvas, or over
 * max_side px on a side) is scaled down to fit the canvas. Always overlaps
 * the canvas, so a paste is never lost off-canvas.
 * @returns {{x:number,y:number,width:number,height:number,scale:number}}
 */
export function compute_paste_placement(content, doc_width, doc_height, view = null, opts = {}) {
	const max_factor = opts.max_factor || 4;
	const max_side = opts.max_side || 8192;
	let width = Math.max(1, Math.round(content.width)), height = Math.max(1, Math.round(content.height));
	let scale = 1;
	const absurd = width > doc_width * max_factor || height > doc_height * max_factor
		|| width > max_side || height > max_side;
	if (absurd) {
		scale = Math.min(doc_width / width, doc_height / height, max_side / width, max_side / height);
		width = Math.max(1, Math.round(width * scale));
		height = Math.max(1, Math.round(height * scale));
	}
	const area = visible_document_rect(doc_width, doc_height, view);
	const cx = area.x + area.width / 2, cy = area.y + area.height / 2;
	return { x: Math.round(cx - width / 2), y: Math.round(cy - height / 2), width, height, scale };
}

/** UTF-8 safe data URL for an SVG string. */
export function svg_data_url(svgText) {
	return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(String(svgText).replace(/^\s*<\?xml[^>]*\?>\s*/, ''));
}

/**
 * Embedded Smart Layer source document: one image layer holding the SVG (as
 * a data:image/svg+xml URL, so the vector original travels with the file and
 * can be re-rendered), sized to the content.
 */
export function smart_source_document({ svg_url, width, height, name = 'Vector Paste', version = '4.0.0' }) {
	return {
		info: {
			width, height, about: 'Image data with multi-layers. Can be opened using Visteras Studio',
			format: 'vsd', app: 'visteras-studio', version, layer_active: 1, guides: [], transparency: true,
		},
		user_fonts: {}, vectors: [], smart_sources: {}, smart_layers_version: 1,
		layers: [{
			id: 1, name: name + '.svg', type: 'image', x: 0, y: 0, width, height,
			width_original: width, height_original: height, parent_id: 0, order: 1, visible: true,
			opacity: 100, rotate: 0, filters: [], composition: 'source-over', is_vector: true,
			params: { visteras_source: 'vector-paste' },
		}],
		data: [{ id: 1, data: svg_url }],
	};
}
