/**
 * Vector to Selection Conversion for Visteras
 * 
 * Converts a Vector object's closed subpaths into an active raster selection mask
 * with marching ants visualization.
 */

import config from '../../config.js';
import app from '../../app.js';
import Vector_renderer from './vector-renderer.js';

/**
 * Converts a vector into a raster selection.
 * @param {import('./vector-model.js').Vector} vector 
 */
export function vector_to_selection(vector) {
	if (!vector || !vector.paths || vector.paths.length === 0) return;

	const baseSelection = (app.Layers && app.Layers.Base_selection)
		? app.Layers.Base_selection
		: null;

	if (!baseSelection) return;

	const W = Math.max(1, config.WIDTH || 800);
	const H = Math.max(1, config.HEIGHT || 600);

	const maskCanvas = document.createElement('canvas');
	maskCanvas.width = W;
	maskCanvas.height = H;
	const mctx = maskCanvas.getContext('2d');

	mctx.fillStyle = '#ffffff';
	Vector_renderer.draw_vector_path(mctx, vector);
	mctx.fill(vector.fill_rule || 'nonzero');

	baseSelection.set_mask_canvas(maskCanvas);
	config.need_render = true;
}
