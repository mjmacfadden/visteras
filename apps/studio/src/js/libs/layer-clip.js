/**
 * Clipping mask helpers — clip is independent of blend mode.
 *
 * Legacy docs encoded clip as composition === 'source-atop'. New model uses
 * layer.clipped (boolean) and keeps composition as the real blend mode.
 */

/**
 * @param {object|null|undefined} layer
 * @returns {boolean}
 */
export function is_layer_clipped(layer) {
	if (!layer) return false;
	if (layer.clipped === true) return true;
	// Legacy: clip was stored as the blend/composition field
	return layer.composition === 'source-atop';
}

/**
 * Blend / Porter-Duff mode used when compositing a layer onto the backdrop.
 * Clipping is applied separately as an alpha mask — never override the blend
 * with source-atop here. Legacy source-atop meant "clipped", not a blend.
 *
 * @param {object|null|undefined} layer
 * @returns {string}
 */
export function get_render_composition(layer) {
	if (!layer) return 'source-over';
	var composition = layer.composition == null ? 'source-over' : layer.composition;
	if (composition === 'source-atop') {
		return 'source-over';
	}
	return composition;
}

/**
 * Migrate legacy source-atop clip encoding onto the clipped flag.
 * Mutates and returns the layer.
 *
 * @param {object} layer
 * @returns {object}
 */
export function migrate_layer_clipping(layer) {
	if (!layer) return layer;
	if (layer.composition === 'source-atop') {
		layer.clipped = true;
		layer.composition = 'source-over';
	}
	if (layer.clipped == null) {
		layer.clipped = false;
	}
	return layer;
}

/**
 * Build Update_layer_action payload to toggle clipping without touching blend
 * (except clearing legacy source-atop on release).
 *
 * @param {object} layer
 * @returns {{clipped: boolean, composition?: string}}
 */
export function clipping_toggle_updates(layer) {
	var currently = is_layer_clipped(layer);
	var updates = { clipped: !currently };
	if (currently && layer && layer.composition === 'source-atop') {
		updates.composition = 'source-over';
	}
	return updates;
}
