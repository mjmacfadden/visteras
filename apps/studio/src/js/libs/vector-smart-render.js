/**
 * Vector Smart Objects stay crisp when scaled (Photoshop re-rasterizes vector
 * Smart Objects from the vector data). A Vector paste keeps its SVG in the
 * embedded source document; when the layer is drawn larger than the paste-size
 * preview, we re-render that SVG at the needed pixel size (debounced, cached
 * per source revision) and draw from it instead of stretching the preview.
 */

export const MAX_SIDE = 8192;
export const MAX_PIXELS = 36e6;

/** The SVG data URL of an unedited Vector Smart Object source, else null. */
export function vector_svg_url(source) {
	const doc = source && source.document;
	if (!doc || !Array.isArray(doc.layers) || doc.layers.length !== 1) return null;
	const layer = doc.layers[0];
	if (!layer || layer.is_vector !== true || (layer.filters && layer.filters.length)) return null;
	const entry = (doc.data || []).find((d) => d && d.id === layer.id);
	const url = entry && entry.data;
	return typeof url === 'string' && url.startsWith('data:image/svg+xml') ? url : null;
}

/** Pixel size to rasterize at for a target draw size (25% headroom, capped). */
export function wanted_size(targetW, targetH) {
	let w = Math.ceil(Math.max(1, targetW) * 1.25);
	let h = Math.ceil(Math.max(1, targetH) * 1.25);
	const side = Math.max(w / MAX_SIDE, h / MAX_SIDE, Math.sqrt((w * h) / MAX_PIXELS), 1);
	if (side > 1) { w = Math.floor(w / side); h = Math.floor(h / side); }
	return { w: Math.max(1, w), h: Math.max(1, h) };
}

/** Does a raster of size (w,h) already cover the target draw size? */
export function covers(w, h, targetW, targetH) {
	return w >= targetW * 0.98 && h >= targetH * 0.98;
}

function default_rasterize(url, w, h) {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			const canvas = document.createElement('canvas');
			canvas.width = w;
			canvas.height = h;
			canvas.getContext('2d').drawImage(img, 0, 0, w, h);
			resolve(canvas);
		};
		img.onerror = () => reject(new Error('vector re-render failed'));
		img.src = url;
	});
}

const cache = new Map(); // source.id -> { revision, canvas, pending, timer }

/**
 * Best raster for drawing `source` at targetW × targetH device pixels:
 * a cached crisp render, or null (use the normal preview). Schedules a
 * re-render when the preview is too small; `onReady` asks for a redraw.
 */
export function crisp_vector_source(source, targetW, targetH, onReady, rasterize = default_rasterize) {
	const url = vector_svg_url(source);
	if (!url) return null;
	const link = source.link;
	const baseW = (link && (link.naturalWidth || link.width)) || 0;
	const baseH = (link && (link.naturalHeight || link.height)) || 0;
	let entry = cache.get(source.id);
	if (entry && entry.revision !== source.revision) {
		clearTimeout(entry.timer);
		cache.delete(source.id);
		entry = null;
	}
	const cached = entry && entry.canvas;
	if (cached && covers(cached.width, cached.height, targetW, targetH)) return cached;
	if (covers(baseW, baseH, targetW, targetH)) return cached && cached.width > baseW ? cached : null;
	const want = wanted_size(targetW, targetH);
	if (!entry) { entry = { revision: source.revision, canvas: null, pending: null, timer: null }; cache.set(source.id, entry); }
	if (!entry.pending || entry.pending.w < want.w || entry.pending.h < want.h) {
		entry.pending = want;
		clearTimeout(entry.timer);
		entry.timer = setTimeout(() => {
			const size = entry.pending;
			Promise.resolve(rasterize(url, size.w, size.h)).then((canvas) => {
				if (cache.get(source.id) !== entry) return;
				if (!entry.canvas || canvas.width > entry.canvas.width) entry.canvas = canvas;
				entry.pending = null;
				if (onReady) onReady();
			}).catch(() => { entry.pending = null; });
		}, 120);
	}
	return cached || null;
}

export function _reset_vector_smart_cache() {
	for (const e of cache.values()) clearTimeout(e.timer);
	cache.clear();
}
