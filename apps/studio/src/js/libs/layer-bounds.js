import app from './../app.js';
import config from './../config.js';
import { is_group, get_descendant_ids } from './layer-tree.js';

/**
 * Calculates the axis-aligned bounding box of a bounds object that may be rotated.
 * @param {{ x: number, y: number, width: number, height: number, rotate?: number }} b
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number }}
 */
function get_bounds_aabb(b) {
	if (!b) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
	const rot = b.rotate || 0;
	if (rot === 0) {
		return {
			minX: b.x,
			minY: b.y,
			maxX: b.x + b.width,
			maxY: b.y + b.height,
		};
	}
	const cx = b.x + b.width / 2;
	const cy = b.y + b.height / 2;
	const hw = b.width / 2;
	const hh = b.height / 2;
	const rad = rot * Math.PI / 180;
	const cosA = Math.cos(rad);
	const sinA = Math.sin(rad);

	const corners = [
		{ dx: -hw, dy: -hh },
		{ dx: hw, dy: -hh },
		{ dx: hw, dy: hh },
		{ dx: -hw, dy: hh },
	];
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const c of corners) {
		const x = cx + c.dx * cosA - c.dy * sinA;
		const y = cy + c.dx * sinA + c.dy * cosA;
		if (x < minX) minX = x;
		if (y < minY) minY = y;
		if (x > maxX) maxX = x;
		if (y > maxY) maxY = y;
	}
	return { minX, minY, maxX, maxY };
}

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
					const aabb = get_bounds_aabb(cb);
					if (aabb.minX < minX) minX = aabb.minX;
					if (aabb.minY < minY) minY = aabb.minY;
					if (aabb.maxX > maxX) maxX = aabb.maxX;
					if (aabb.maxY > maxY) maxY = aabb.maxY;
				}
			}
		}
		if (found && maxX > minX && maxY > minY) {
			return {
				x: Math.round(minX),
				y: Math.round(minY),
				width: Math.round(maxX - minX),
				height: Math.round(maxY - minY),
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

	const baseW = w || layer.width_original || layer.width || 1;
	const baseH = h || layer.height_original || layer.height || 1;
	const scaleX = (layer.width || baseW) / baseW;
	const scaleY = (layer.height || baseH) / baseH;

	const contentW = (maxX - minX + 1) * scaleX;
	const contentH = (maxY - minY + 1) * scaleY;
	const rot = layer.rotate || 0;

	if (rot === 0) {
		const contentX = (layer.x || 0) + minX * scaleX;
		const contentY = (layer.y || 0) + minY * scaleY;
		return {
			x: contentX,
			y: contentY,
			width: contentW,
			height: contentH,
			rotate: 0,
			local_min_x: minX,
			local_min_y: minY,
			local_width: maxX - minX + 1,
			local_height: maxY - minY + 1,
		};
	}

	const local_cx = (minX + maxX + 1) / 2;
	const local_cy = (minY + maxY + 1) / 2;
	const layer_cx = baseW / 2;
	const layer_cy = baseH / 2;
	const dcx = (local_cx - layer_cx) * scaleX;
	const dcy = (local_cy - layer_cy) * scaleY;

	const rad = rot * Math.PI / 180;
	const cosA = Math.cos(rad);
	const sinA = Math.sin(rad);

	const layer_world_cx = (layer.x || 0) + (layer.width || baseW) / 2;
	const layer_world_cy = (layer.y || 0) + (layer.height || baseH) / 2;

	const content_world_cx = layer_world_cx + (dcx * cosA - dcy * sinA);
	const content_world_cy = layer_world_cy + (dcx * sinA + dcy * cosA);

	const contentX = content_world_cx - contentW / 2;
	const contentY = content_world_cy - contentH / 2;

	return {
		x: contentX,
		y: contentY,
		width: contentW,
		height: contentH,
		rotate: rot,
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
			const aabb = get_bounds_aabb(b);
			if (aabb.minX < minX) minX = aabb.minX;
			if (aabb.minY < minY) minY = aabb.minY;
			if (aabb.maxX > maxX) maxX = aabb.maxX;
			if (aabb.maxY > maxY) maxY = aabb.maxY;
		}
	}

	if (!found || maxX <= minX || maxY <= minY) return null;

	return {
		x: Math.round(minX),
		y: Math.round(minY),
		width: Math.round(maxX - minX),
		height: Math.round(maxY - minY),
		rotate: 0,
	};
}
