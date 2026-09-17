/**
 * Bidirectional SVG <-> Studio Vector conversion for cross-app clipboard.
 *
 * Supports path data (M/L/H/V/C/S/Q/T/Z) plus basic shapes (rect, circle,
 * ellipse, line, polyline, polygon). Arc commands are linearized; gradients,
 * text, images, and filters are not preserved as editable Studio vectors.
 */

import { Vector, Subpath, Anchor } from './vector-model.js';

export const VISTERAS_VECTOR_MIME = 'web application/x-visteras-vector+json';
export const SVG_MIME = 'image/svg+xml';

function fmt(n) {
	if (!Number.isFinite(n)) return '0';
	const r = Math.round(n * 1000) / 1000;
	return String(r);
}

function attr_escape(s) {
	return String(s == null ? '' : s)
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;');
}

/**
 * @param {import('./vector-model.js').Subpath} subpath
 * @returns {string}
 */
export function subpath_to_path_d(subpath) {
	const anchors = subpath && subpath.anchors ? subpath.anchors : [];
	if (anchors.length === 0) return '';

	const parts = [];
	parts.push(`M ${fmt(anchors[0].point.x)} ${fmt(anchors[0].point.y)}`);

	const append_segment = (curr, next) => {
		const has_curve = !!(curr.handle_out || next.handle_in);
		if (has_curve) {
			const cp1 = curr.handle_out || curr.point;
			const cp2 = next.handle_in || next.point;
			parts.push(`C ${fmt(cp1.x)} ${fmt(cp1.y)} ${fmt(cp2.x)} ${fmt(cp2.y)} ${fmt(next.point.x)} ${fmt(next.point.y)}`);
		} else {
			parts.push(`L ${fmt(next.point.x)} ${fmt(next.point.y)}`);
		}
	};

	for (let i = 0; i < anchors.length - 1; i++) {
		append_segment(anchors[i], anchors[i + 1]);
	}

	if (subpath.closed && anchors.length > 1) {
		append_segment(anchors[anchors.length - 1], anchors[0]);
		parts.push('Z');
	}

	return parts.join(' ');
}

/**
 * @param {import('./vector-model.js').Vector|import('./vector-model.js').Vector[]} vectors
 * @returns {string}
 */
export function vectors_to_svg(vectors) {
	const list = Array.isArray(vectors) ? vectors.filter(Boolean) : (vectors ? [vectors] : []);
	if (list.length === 0) return '';

	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const v of list) {
		const b = typeof v.getBounds === 'function' ? v.getBounds() : null;
		if (!b) continue;
		if (b.minX < minX) minX = b.minX;
		if (b.minY < minY) minY = b.minY;
		if (b.maxX > maxX) maxX = b.maxX;
		if (b.maxY > maxY) maxY = b.maxY;
	}
	if (!Number.isFinite(minX)) {
		minX = 0; minY = 0; maxX = 100; maxY = 100;
	}

	const pad = 2;
	const vbX = minX - pad;
	const vbY = minY - pad;
	const vbW = Math.max(1, (maxX - minX) + pad * 2);
	const vbH = Math.max(1, (maxY - minY) + pad * 2);

	const meta = {
		format: 'visteras-vector',
		version: 1,
		vectors: list.map(v => (typeof v.toJSON === 'function' ? v.toJSON() : v))
	};

	const body = list.map((vector) => {
		const fill = vector.fill && vector.fill !== 'none' ? vector.fill : 'none';
		const stroke = vector.stroke && vector.stroke !== 'none' ? vector.stroke : 'none';
		const sw = vector.stroke_width != null ? vector.stroke_width : 0;
		const opacity = (vector.opacity != null ? vector.opacity : 100) / 100;
		const rule = vector.fill_rule === 'evenodd' ? 'evenodd' : 'nonzero';
		const join = vector.stroke_join || 'miter';
		const cap = vector.stroke_cap || 'butt';

		const path_els = (vector.paths || []).map((sp) => {
			const d = subpath_to_path_d(sp);
			if (!d) return '';
			return `<path d="${attr_escape(d)}" fill="${attr_escape(fill)}" fill-rule="${rule}" stroke="${attr_escape(stroke)}" stroke-width="${fmt(sw)}" stroke-linejoin="${attr_escape(join)}" stroke-linecap="${attr_escape(cap)}" opacity="${fmt(opacity)}" />`;
		}).filter(Boolean);

		if (path_els.length === 0) return '';
		if (path_els.length === 1) return path_els[0];
		return `<g data-visteras-vector-name="${attr_escape(vector.name || '')}">${path_els.join('')}</g>`;
	}).filter(Boolean).join('\n');

	return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(vbX)} ${fmt(vbY)} ${fmt(vbW)} ${fmt(vbH)}" width="${fmt(vbW)}" height="${fmt(vbH)}" data-visteras-format="1">\n<!--${JSON.stringify(meta)}-->\n${body}\n</svg>`;
}

/**
 * @param {string} svgText
 * @returns {boolean}
 */
export function looks_like_svg(svgText) {
	if (!svgText || typeof svgText !== 'string') return false;
	const t = svgText.trim();
	if (t.indexOf('<svg') === -1 && t.indexOf('<SVG') === -1) return false;
	return t.startsWith('<svg') || t.startsWith('<SVG') || t.startsWith('<?xml') || t.includes('<svg');
}

function tokenize_path_d(d) {
	const tokens = [];
	const re = /([MmLlHhVvCcSsQqTtAaZz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
	let m;
	while ((m = re.exec(d)) !== null) {
		if (m[1]) tokens.push({ type: 'cmd', value: m[1] });
		else tokens.push({ type: 'num', value: parseFloat(m[2]) });
	}
	return tokens;
}

/**
 * @param {string} d
 * @returns {import('./vector-model.js').Subpath[]}
 */
export function path_d_to_subpaths(d) {
	if (!d || typeof d !== 'string') return [];
	const tokens = tokenize_path_d(d);
	const subpaths = [];
	let anchors = [];
	let closed = false;
	let i = 0;
	let cx = 0, cy = 0;
	let startX = 0, startY = 0;
	let lastCmd = '';
	let lastCp = null;

	const flush = () => {
		if (anchors.length > 0) {
			// Closed paths often end with an explicit segment back to the start
			// before Z; drop a duplicate final anchor that matches the first.
			if (closed && anchors.length > 1) {
				const a0 = anchors[0].point;
				const aN = anchors[anchors.length - 1].point;
				if (Math.abs(a0.x - aN.x) < 1e-6 && Math.abs(a0.y - aN.y) < 1e-6) {
					const dup = anchors.pop();
					// Preserve closing handle_in on the first anchor if present
					if (dup.handle_in && !anchors[0].handle_in) {
						anchors[0].handle_in = { ...dup.handle_in };
					}
				}
			}
			subpaths.push(new Subpath({ closed, anchors }));
		}
		anchors = [];
		closed = false;
		lastCp = null;
	};

	const push_corner = (x, y) => {
		anchors.push(new Anchor({ point: { x, y }, handle_in: null, handle_out: null, type: 'corner' }));
	};

	const ensure_current = () => {
		if (anchors.length === 0) push_corner(cx, cy);
	};

	const set_handle_out = (x, y) => {
		ensure_current();
		const a = anchors[anchors.length - 1];
		a.handle_out = { x, y };
		if (a.handle_in) a.type = 'smooth';
	};

	const add_cubic = (x1, y1, x2, y2, x, y) => {
		set_handle_out(x1, y1);
		anchors.push(new Anchor({
			point: { x, y },
			handle_in: { x: x2, y: y2 },
			handle_out: null,
			type: 'smooth'
		}));
		cx = x; cy = y;
		lastCp = { x: x2, y: y2 };
	};

	const add_quad = (x1, y1, x, y) => {
		const c1x = cx + (2 / 3) * (x1 - cx);
		const c1y = cy + (2 / 3) * (y1 - cy);
		const c2x = x + (2 / 3) * (x1 - x);
		const c2y = y + (2 / 3) * (y1 - y);
		add_cubic(c1x, c1y, c2x, c2y, x, y);
		lastCp = { x: x1, y: y1 };
	};

	const read_nums = (count) => {
		const nums = [];
		while (nums.length < count && i < tokens.length && tokens[i].type === 'num') {
			nums.push(tokens[i++].value);
		}
		return nums.length === count ? nums : null;
	};

	while (i < tokens.length) {
		const tok = tokens[i];
		if (tok.type === 'cmd') {
			lastCmd = tok.value;
			i++;
		} else if (!lastCmd) {
			i++;
			continue;
		}

		const cmd = lastCmd;
		const rel = cmd === cmd.toLowerCase();
		const C = cmd.toUpperCase();

		if (C === 'Z') {
			closed = true;
			cx = startX; cy = startY;
			flush();
			continue;
		}

		if (C === 'M') {
			const first = read_nums(2);
			if (!first) break;
			if (anchors.length) flush();
			let [x, y] = first;
			if (rel) { x += cx; y += cy; }
			cx = x; cy = y; startX = x; startY = y;
			push_corner(x, y);
			lastCp = null;
			lastCmd = rel ? 'l' : 'L';
			continue;
		}

		if (C === 'L') {
			for (;;) {
				const n = read_nums(2);
				if (!n) break;
				let [x, y] = n;
				if (rel) { x += cx; y += cy; }
				push_corner(x, y);
				cx = x; cy = y;
				lastCp = null;
			}
			continue;
		}

		if (C === 'H') {
			for (;;) {
				const n = read_nums(1);
				if (!n) break;
				let x = n[0];
				if (rel) x += cx;
				push_corner(x, cy);
				cx = x;
				lastCp = null;
			}
			continue;
		}

		if (C === 'V') {
			for (;;) {
				const n = read_nums(1);
				if (!n) break;
				let y = n[0];
				if (rel) y += cy;
				push_corner(cx, y);
				cy = y;
				lastCp = null;
			}
			continue;
		}

		if (C === 'C') {
			for (;;) {
				const n = read_nums(6);
				if (!n) break;
				let [x1, y1, x2, y2, x, y] = n;
				if (rel) {
					x1 += cx; y1 += cy; x2 += cx; y2 += cy; x += cx; y += cy;
				}
				add_cubic(x1, y1, x2, y2, x, y);
			}
			continue;
		}

		if (C === 'S') {
			for (;;) {
				const n = read_nums(4);
				if (!n) break;
				let [x2, y2, x, y] = n;
				if (rel) { x2 += cx; y2 += cy; x += cx; y += cy; }
				let x1 = cx, y1 = cy;
				const prev = lastCmd.toUpperCase();
				if (lastCp && (prev === 'C' || prev === 'S')) {
					x1 = 2 * cx - lastCp.x;
					y1 = 2 * cy - lastCp.y;
				}
				add_cubic(x1, y1, x2, y2, x, y);
				lastCmd = cmd;
			}
			continue;
		}

		if (C === 'Q') {
			for (;;) {
				const n = read_nums(4);
				if (!n) break;
				let [x1, y1, x, y] = n;
				if (rel) { x1 += cx; y1 += cy; x += cx; y += cy; }
				add_quad(x1, y1, x, y);
			}
			continue;
		}

		if (C === 'T') {
			for (;;) {
				const n = read_nums(2);
				if (!n) break;
				let [x, y] = n;
				if (rel) { x += cx; y += cy; }
				let x1 = cx, y1 = cy;
				const prev = lastCmd.toUpperCase();
				if (lastCp && (prev === 'Q' || prev === 'T')) {
					x1 = 2 * cx - lastCp.x;
					y1 = 2 * cy - lastCp.y;
				}
				add_quad(x1, y1, x, y);
				lastCmd = cmd;
			}
			continue;
		}

		if (C === 'A') {
			for (;;) {
				const n = read_nums(7);
				if (!n) break;
				let x = n[5], y = n[6];
				if (rel) { x += cx; y += cy; }
				push_corner(x, y);
				cx = x; cy = y;
				lastCp = null;
			}
			continue;
		}

		break;
	}

	flush();
	return subpaths;
}

function parse_points_attr(points) {
	if (!points) return [];
	const nums = String(points).trim().split(/[\s,]+/).map(parseFloat).filter(Number.isFinite);
	const pts = [];
	for (let i = 0; i + 1 < nums.length; i += 2) {
		pts.push({ x: nums[i], y: nums[i + 1] });
	}
	return pts;
}

function apply_element_style(el, defaults = {}) {
	const get = (name, fallback) => (el.hasAttribute(name) ? el.getAttribute(name) : fallback);
	const fill = get('fill', defaults.fill != null ? defaults.fill : '#000000');
	const stroke = get('stroke', defaults.stroke != null ? defaults.stroke : 'none');
	const stroke_width = parseFloat(get('stroke-width', defaults.stroke_width != null ? defaults.stroke_width : 1)) || 0;
	const fill_rule = get('fill-rule', defaults.fill_rule || 'nonzero');
	const stroke_join = get('stroke-linejoin', defaults.stroke_join || 'miter');
	const stroke_cap = get('stroke-linecap', defaults.stroke_cap || 'butt');
	const op = parseFloat(get('opacity', '1'));
	return {
		fill,
		stroke,
		stroke_width,
		fill_rule,
		stroke_join,
		stroke_cap,
		opacity: Number.isFinite(op) ? Math.round(op * 100) : 100
	};
}

function shape_to_subpaths(el) {
	const tag = el.tagName && el.tagName.toLowerCase();
	if (!tag) return [];

	if (tag === 'path') {
		return path_d_to_subpaths(el.getAttribute('d') || '');
	}

	if (tag === 'rect') {
		const x = parseFloat(el.getAttribute('x') || '0') || 0;
		const y = parseFloat(el.getAttribute('y') || '0') || 0;
		const w = parseFloat(el.getAttribute('width') || '0') || 0;
		const h = parseFloat(el.getAttribute('height') || '0') || 0;
		return [new Subpath({
			closed: true,
			anchors: [
				new Anchor({ point: { x, y } }),
				new Anchor({ point: { x: x + w, y } }),
				new Anchor({ point: { x: x + w, y: y + h } }),
				new Anchor({ point: { x, y: y + h } })
			]
		})];
	}

	if (tag === 'circle' || tag === 'ellipse') {
		const cx = parseFloat(el.getAttribute('cx') || '0') || 0;
		const cy = parseFloat(el.getAttribute('cy') || '0') || 0;
		const rx = tag === 'circle'
			? (parseFloat(el.getAttribute('r') || '0') || 0)
			: (parseFloat(el.getAttribute('rx') || '0') || 0);
		const ry = tag === 'circle' ? rx : (parseFloat(el.getAttribute('ry') || '0') || 0);
		const kx = rx * 0.5522847498;
		const ky = ry * 0.5522847498;
		return [new Subpath({
			closed: true,
			anchors: [
				new Anchor({ point: { x: cx + rx, y: cy }, handle_in: { x: cx + rx, y: cy - ky }, handle_out: { x: cx + rx, y: cy + ky }, type: 'symmetric' }),
				new Anchor({ point: { x: cx, y: cy + ry }, handle_in: { x: cx + kx, y: cy + ry }, handle_out: { x: cx - kx, y: cy + ry }, type: 'symmetric' }),
				new Anchor({ point: { x: cx - rx, y: cy }, handle_in: { x: cx - rx, y: cy + ky }, handle_out: { x: cx - rx, y: cy - ky }, type: 'symmetric' }),
				new Anchor({ point: { x: cx, y: cy - ry }, handle_in: { x: cx - kx, y: cy - ry }, handle_out: { x: cx + kx, y: cy - ry }, type: 'symmetric' })
			]
		})];
	}

	if (tag === 'line') {
		const x1 = parseFloat(el.getAttribute('x1') || '0') || 0;
		const y1 = parseFloat(el.getAttribute('y1') || '0') || 0;
		const x2 = parseFloat(el.getAttribute('x2') || '0') || 0;
		const y2 = parseFloat(el.getAttribute('y2') || '0') || 0;
		return [new Subpath({
			closed: false,
			anchors: [
				new Anchor({ point: { x: x1, y: y1 } }),
				new Anchor({ point: { x: x2, y: y2 } })
			]
		})];
	}

	if (tag === 'polyline' || tag === 'polygon') {
		const pts = parse_points_attr(el.getAttribute('points'));
		if (pts.length === 0) return [];
		return [new Subpath({
			closed: tag === 'polygon',
			anchors: pts.map(p => new Anchor({ point: { x: p.x, y: p.y } }))
		})];
	}

	return [];
}

function try_embedded_vectors(svgText) {
	const m = svgText.match(/<!--\s*(\{[\s\S]*?"format"\s*:\s*"visteras-vector"[\s\S]*?\})\s*-->/);
	if (!m) return null;
	try {
		const data = JSON.parse(m[1]);
		if (!data || data.format !== 'visteras-vector' || !Array.isArray(data.vectors)) return null;
		return data.vectors.map(v => {
			const vec = Vector.fromJSON(v);
			vec.id = 'vec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
			return vec;
		});
	} catch (e) {
		return null;
	}
}

function svg_dom_to_vectors(doc) {
	const root = doc.documentElement;
	const shape_selector = 'path,rect,circle,ellipse,line,polyline,polygon';
	const nodes = (root.matches && root.matches(shape_selector))
		? [root]
		: Array.from(root.querySelectorAll(shape_selector));

	const filtered = nodes.filter((el) => {
		let p = el.parentElement;
		while (p) {
			const t = p.tagName && p.tagName.toLowerCase();
			if (t === 'defs' || t === 'clippath' || t === 'mask' || t === 'marker' || t === 'symbol' || t === 'pattern') {
				return false;
			}
			p = p.parentElement;
		}
		return true;
	});

	if (filtered.length === 0) return [];

	const vectors = [];
	let current = null;
	let current_style_key = null;

	for (const el of filtered) {
		const style = apply_element_style(el);
		const style_key = JSON.stringify(style);
		const subpaths = shape_to_subpaths(el);
		if (!subpaths.length) continue;

		if (!current || style_key !== current_style_key) {
			current = new Vector({
				name: 'Pasted Vector',
				mode: 'shape',
				fill: style.fill === 'none' ? null : style.fill,
				stroke: style.stroke === 'none' ? null : style.stroke,
				stroke_width: style.stroke_width,
				fill_rule: style.fill_rule === 'evenodd' ? 'evenodd' : 'nonzero',
				stroke_join: style.stroke_join,
				stroke_cap: style.stroke_cap,
				opacity: style.opacity,
				paths: []
			});
			current_style_key = style_key;
			vectors.push(current);
		}
		current.paths.push(...subpaths);
	}

	return vectors;
}

/**
 * @param {string} svgText
 * @returns {import('./vector-model.js').Vector[]}
 */
export function svg_to_vectors(svgText) {
	if (!looks_like_svg(svgText)) return [];

	const embedded = try_embedded_vectors(svgText);
	if (embedded && embedded.length) return embedded;

	const parser = new DOMParser();
	let doc = parser.parseFromString(svgText, 'image/svg+xml');
	if (doc.querySelector('parsererror')) {
		doc = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${svgText}</svg>`, 'image/svg+xml');
		if (doc.querySelector('parsererror')) return [];
	}
	return svg_dom_to_vectors(doc);
}

/**
 * @param {string} svgText
 * @param {{pngBlob?: Blob, jsonText?: string}} [extra]
 * @returns {Promise<boolean>}
 */
export async function write_svg_clipboard(svgText, extra = {}) {
	if (!svgText) return false;
	try {
		if (typeof ClipboardItem !== 'undefined' && navigator.clipboard && navigator.clipboard.write) {
			const try_write = async (items) => {
				await navigator.clipboard.write([new ClipboardItem(items)]);
			};

			const primary = {};
			primary[SVG_MIME] = new Blob([svgText], { type: SVG_MIME });
			primary['text/plain'] = new Blob([svgText], { type: 'text/plain' });
			if (extra.pngBlob) primary['image/png'] = extra.pngBlob;
			if (extra.jsonText) {
				try {
					primary[VISTERAS_VECTOR_MIME] = new Blob([extra.jsonText], { type: VISTERAS_VECTOR_MIME });
				} catch (e) { /* ignore */ }
			}

			try {
				await try_write(primary);
				return true;
			} catch (e) {
				try {
					await try_write({
						[SVG_MIME]: new Blob([svgText], { type: SVG_MIME }),
						'text/plain': new Blob([svgText], { type: 'text/plain' })
					});
					return true;
				} catch (e2) {
					await try_write({
						'text/plain': new Blob([svgText], { type: 'text/plain' })
					});
					return true;
				}
			}
		}
		if (navigator.clipboard && navigator.clipboard.writeText) {
			await navigator.clipboard.writeText(svgText);
			return true;
		}
	} catch (err) {
		console.warn('write_svg_clipboard failed:', err);
	}
	return false;
}

/**
 * @param {ClipboardEvent} [e]
 * @returns {Promise<string|null>}
 */
export async function read_svg_from_clipboard_event(e) {
	const as_svg = (text) => {
		if (!text) return null;
		if (looks_like_svg(text)) return text;
		const m = String(text).match(/<svg[\s\S]*?<\/svg>/i);
		return m ? m[0] : null;
	};

	if (e && e.clipboardData) {
		const items = e.clipboardData.items;
		if (items) {
			for (let i = 0; i < items.length; i++) {
				const type = items[i].type || '';
				if (type === SVG_MIME || type === 'text/html' || type === 'text/plain' || type === VISTERAS_VECTOR_MIME) {
					const text = await new Promise((resolve) => {
						try {
							items[i].getAsString((s) => resolve(s));
						} catch (err) {
							resolve(null);
						}
					});
					if (type === VISTERAS_VECTOR_MIME && text) {
						try {
							const data = JSON.parse(text);
							if (data && data.format === 'visteras-vector' && Array.isArray(data.vectors)) {
								return vectors_to_svg(data.vectors.map(Vector.fromJSON));
							}
						} catch (err) { /* fall through */ }
					}
					const svg = as_svg(text);
					if (svg) return svg;
				}
			}
		}
		const plain = as_svg(e.clipboardData.getData('text/plain'));
		if (plain) return plain;
		const html = as_svg(e.clipboardData.getData('text/html'));
		if (html) return html;
	}

	try {
		if (navigator.clipboard && navigator.clipboard.read) {
			const clip_items = await navigator.clipboard.read();
			for (const item of clip_items) {
				const types = item.types || [];
				for (const type of types) {
					if (type === SVG_MIME || type === 'text/plain' || type === 'text/html' || type === VISTERAS_VECTOR_MIME) {
						const blob = await item.getType(type);
						const text = await blob.text();
						if (type === VISTERAS_VECTOR_MIME) {
							try {
								const data = JSON.parse(text);
								if (data && data.format === 'visteras-vector' && Array.isArray(data.vectors)) {
									return vectors_to_svg(data.vectors.map(Vector.fromJSON));
								}
							} catch (err) { /* ignore */ }
						}
						const svg = as_svg(text);
						if (svg) return svg;
					}
				}
			}
		} else if (navigator.clipboard && navigator.clipboard.readText) {
			const text = await navigator.clipboard.readText();
			const svg = as_svg(text);
			if (svg) return svg;
		}
	} catch (err) {
		// Permission denied — event path may still have succeeded
	}
	return null;
}

export function get_vector_clip_channel() {
	try {
		if (typeof BroadcastChannel !== 'undefined') {
			return new BroadcastChannel('visteras-vector-clip');
		}
	} catch (e) { /* ignore */ }
	return null;
}

export function publish_vector_clip(svgText, meta = {}) {
	const ch = get_vector_clip_channel();
	if (!ch) return;
	try {
		ch.postMessage({ type: 'vector-clipboard', svg: svgText, meta, ts: Date.now() });
	} catch (e) { /* ignore */ }
}
