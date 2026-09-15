import app from './../app.js';
import config from './../config.js';
import Layer_raster_class from './../modules/layer/raster.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

const Layer_raster = new Layer_raster_class();

/**
 * Create a blank full-document image layer above the current selection.
 * Insert_layer_action places it above the active layer by default.
 */
function insert_blank_image_layer() {
	const new_layer = {
		name: 'Layer ' + (app.Layers ? app.Layers.auto_increment : 1),
		type: 'image',
		link: document.createElement('canvas'),
		data: null,
		width: config.WIDTH,
		height: config.HEIGHT,
		width_original: config.WIDTH,
		height_original: config.HEIGHT,
		x: 0,
		y: 0,
	};
	new_layer.link.width = config.WIDTH;
	new_layer.link.height = config.HEIGHT;
	app.State.do_action(new app.Actions.Insert_layer_action(new_layer, false));
	return config.layer;
}

/**
 * Normalize a raster layer's canvas buffer to the document dimensions if it has been moved or transformed.
 * This ensures subsequent paint strokes across the canvas are not clipped or masked by layer bounds.
 *
 * @param {object} layer
 */
export function normalize_raster_layer_to_document(layer) {
	if (!layer || layer.type !== 'image') return;
	if (layer.x === 0 && layer.y === 0 && layer.width === config.WIDTH && layer.height === config.HEIGHT && (!layer.rotate || layer.rotate === 0)) {
		return;
	}

	const canvas = document.createElement('canvas');
	canvas.width = config.WIDTH;
	canvas.height = config.HEIGHT;
	const ctx = canvas.getContext('2d');

	const src = layer.link_canvas || layer.link;
	if (src) {
		ctx.save();
		ctx.translate((layer.x || 0) + (layer.width || config.WIDTH) / 2, (layer.y || 0) + (layer.height || config.HEIGHT) / 2);
		if (layer.rotate) {
			ctx.rotate((layer.rotate * Math.PI) / 180);
		}
		ctx.drawImage(
			src,
			-(layer.width || config.WIDTH) / 2,
			-(layer.height || config.HEIGHT) / 2,
			layer.width || config.WIDTH,
			layer.height || config.HEIGHT
		);
		ctx.restore();
	}

	layer.x = 0;
	layer.y = 0;
	layer.width = config.WIDTH;
	layer.height = config.HEIGHT;
	layer.width_original = config.WIDTH;
	layer.height_original = config.HEIGHT;
	layer.rotate = 0;
	layer.link = canvas;
	delete layer.link_canvas;
}

/**
 * Ensure the active layer can accept pixel painting (brush, pencil, eraser, clone, heal).
 *
 * Text layers:
 * - onText 'new-layer' (brush/pencil): do NOT rasterize — insert a blank image
 *   layer above and paint there instead.
 * - onText 'block' (eraser/clone/spot heal): do NOT create a layer and do NOT
 *   rasterize — show a toast and return null so the stroke is blocked.
 * Other non-image types still rasterize.
 *
 * @param {object} [options]
 * @param {string} [options.verb='paint'] - verb used in adjustment-layer error copy
 * @param {'new-layer'|'block'} [options.onText='new-layer'] - text-layer policy
 * @param {string} [options.toolName] - display name for block toast
 * @returns {object|null} image layer to paint on, or null if painting is blocked
 */
export function ensure_paint_layer(options = {}) {
	const verb = options.verb || 'paint';
	const onText = options.onText || 'new-layer';
	const toolName = options.toolName || 'this tool';

	if (config.layer == null || !config.layers || config.layers.length === 0) {
		return insert_blank_image_layer();
	}

	if (config.layer.type === 'adjustment') {
		alertify.error(
			'Cannot ' + verb + ' directly on an adjustment layer. Create a new layer or edit the layer mask.'
		);
		return null;
	}

	if (config.layer.type === 'text') {
		if (onText === 'block') {
			alertify.error('Rasterize layer to use ' + toolName);
			return null;
		}
		// Keep editable text intact; paint on a new blank layer above (full document size).
		return insert_blank_image_layer();
	}

	if (config.layer.type !== 'image') {
		Layer_raster.raster();
	} else {
		normalize_raster_layer_to_document(config.layer);
	}

	return config.layer;
}

export default {
	ensure_paint_layer,
	normalize_raster_layer_to_document,
};
