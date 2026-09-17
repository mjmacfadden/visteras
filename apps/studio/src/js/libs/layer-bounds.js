import app from './../app.js';
import config from './../config.js';
import { is_group, get_descendant_ids } from './layer-tree.js';

/**
 * Calculates the tight non-transparent pixel content bounds of a layer in world canvas coordinates.
 * Returns null if the layer is empty, completely transparent, or has no visible geometry.
 *
 * @param {object} layer
 * @returns {{ x: number, y: number, width: number, height: number, rotate: number }|null}
 */
export function get_layer_content_bounds(layer) {
	if (!layer || layer.visible === false) return null;

	// Vector layer bounds from true Bézier paths
	if (layer.type === 'vector') {
		const vecId = layer.vector_id || (layer.params && layer.params.vector_id);
		const vec = (config.vectors || []).find(v => v.id === vecId) || layer.vector;
		if (vec && typeof vec.getBounds === 'function') {
			const b = vec.getBounds();
			if (b && b.width > 0 && b.height > 0) {
				let strokeOffset = 0;
				const strokeWidth = Number(vec.stroke_width || (layer.params && layer.params.stroke_width) || 0);
				const strokeColor = vec.stroke || (layer.params && layer.params.stroke);
				if (strokeWidth > 0 && strokeColor && strokeColor !== 'none') {
					const strokeAlign = (vec.stroke_align || (layer.params && layer.params.stroke_align) || 'center').toLowerCase();
					if (strokeAlign === 'outside') {
						strokeOffset = strokeWidth;
					} else if (strokeAlign === 'center') {
						strokeOffset = strokeWidth / 2;
					}
				}
				return {
					x: b.minX - strokeOffset,
					y: b.minY - strokeOffset,
					width: b.width + strokeOffset * 2,
					height: b.height + strokeOffset * 2,
					rotate: layer.rotate || 0,
				};
			}
		}
		if (layer.width != null && layer.height != null && layer.width > 0 && layer.height > 0) {
			return {
				x: layer.x || 0,
				y: layer.y || 0,
				width: layer.width,
				height: layer.height,
				rotate: layer.rotate || 0,
			};
		}
		return null;
	}

	// Text layer bounds
	if (layer.type === 'text') {
		if (layer.width != null && layer.height != null && layer.width > 0 && layer.height > 0) {
			return {
				x: layer.x || 0,
				y: layer.y || 0,
				width: layer.width,
				height: layer.height,
				rotate: layer.rotate || 0,
			};
		}
		return null;
	}

	// Adjustment layers have no pixel bounds
	if (layer.type === 'adjustment') {
		return null;
	}

	// Group layers: compute union of all visible descendant children bounds
	if (is_group(layer)) {
		const desc_ids = get_descendant_ids(layer.id, config.layers);
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		let found = false;
		for (const cid of desc_ids) {
			const child = app.Layers.get_layer(cid);
			if (child && !is_group(child) && child.visible !== false) {
				const cb = get_layer_content_bounds(child);
				if (cb && cb.width > 0 && cb.height > 0) {
					found = true;
					if (cb.x < minX) minX = cb.x;
					if (cb.y < minY) minY = cb.y;
					if (cb.x + cb.width > maxX) maxX = cb.x + cb.width;
					if (cb.y + cb.height > maxY) maxY = cb.y + cb.height;
				}
			}
		}
		if (found && maxX > minX && maxY > minY) {
			return {
				x: minX,
				y: minY,
				width: maxX - minX,
				height: maxY - minY,
				rotate: 0,
			};
		}
		return null;
	}

	// Raster / Image layers: scan pixel data for non-transparent pixels
	const canvas = layer.link_canvas || layer.link;
	if (!canvas) {
		return null;
	}

	let w = 0, h = 0;
	let imgData = null;

	if (canvas instanceof HTMLCanvasElement) {
		w = canvas.width;
		h = canvas.height;
		if (w === 0 || h === 0) return null;
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		imgData = ctx.getImageData(0, 0, w, h).data;
	} else if (canvas instanceof HTMLImageElement) {
		w = canvas.naturalWidth || canvas.width;
		h = canvas.naturalHeight || canvas.height;
		if (w === 0 || h === 0) return null;
		if (typeof canvas.complete === 'boolean' && !canvas.complete) return null;
		const tmp = document.createElement('canvas');
		tmp.width = w;
		tmp.height = h;
		const tmpCtx = tmp.getContext('2d', { willReadFrequently: true });
		tmpCtx.drawImage(canvas, 0, 0);
		imgData = tmpCtx.getImageData(0, 0, w, h).data;
	} else {
		return null;
	}

	let minX = w, minY = h, maxX = -1, maxY = -1;
	for (let y = 0; y < h; y++) {
		const rowOffset = y * w * 4;
		for (let x = 0; x < w; x++) {
			if (imgData[rowOffset + x * 4 + 3] > 0) {
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
		}
	}

	if (maxX < minX || maxY < minY) {
		// Completely transparent or newly created layer - fallback to layer dimensions if defined
		if (layer.width != null && layer.height != null && layer.width > 0 && layer.height > 0) {
			return {
				x: layer.x || 0,
				y: layer.y || 0,
				width: layer.width,
				height: layer.height,
				rotate: layer.rotate || 0,
			};
		}
		return null;
	}

	const scaleX = (layer.width || w) / (layer.width_original || w);
	const scaleY = (layer.height || h) / (layer.height_original || h);

	const contentX = (layer.x || 0) + minX * scaleX;
	const contentY = (layer.y || 0) + minY * scaleY;
	const contentW = (maxX - minX + 1) * scaleX;
	const contentH = (maxY - minY + 1) * scaleY;

	return {
		x: contentX,
		y: contentY,
		width: contentW,
		height: contentH,
		rotate: layer.rotate || 0,
		local_min_x: minX,
		local_min_y: minY,
		local_width: maxX - minX + 1,
		local_height: maxY - minY + 1,
	};
}

/**
 * Calculates the bounding box of multiple selected layers.
 * Returns null if all selected layers have no content bounds.
 *
 * @param {Array<object>} layers
 * @returns {{ x: number, y: number, width: number, height: number, rotate: number }|null}
 */
export function get_selection_content_bounds(layers) {
	if (!layers || layers.length === 0) return null;
	if (layers.length === 1) {
		return get_layer_content_bounds(layers[0]);
	}

	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	let found = false;

	for (const layer of layers) {
		const b = get_layer_content_bounds(layer);
		if (b && b.width > 0 && b.height > 0) {
			found = true;
			if (b.x < minX) minX = b.x;
			if (b.y < minY) minY = b.y;
			if (b.x + b.width > maxX) maxX = b.x + b.width;
			if (b.y + b.height > maxY) maxY = b.y + b.height;
		}
	}

	if (!found || maxX <= minX || maxY <= minY) return null;

	return {
		x: minX,
		y: minY,
		width: maxX - minX,
		height: maxY - minY,
		rotate: 0,
	};
}
