/**
 * Pluggable image source for Studio Raw Develop.
 *
 * v1: raster layers / JPEG / PNG via canvas ImageData (no camera-file decode).
 * Later: register a decoder (e.g. LibRaw WASM) that implements the same
 * RawSourceDecoder shape for CR2 / NEF / ARW / DNG without rewriting the UI.
 *
 * Inspired by the UX of pg0/raw-viewer — no code copied from that project
 * (upstream publishes no LICENSE file as of this work).
 */

/**
 * @typedef {object} RawSourceResult
 * @property {number} width
 * @property {number} height
 * @property {ImageData} imageData
 * @property {string} [label]
 * @property {string} [format] - e.g. 'raster', 'jpeg', 'cr2'
 */

/**
 * @typedef {object} RawSourceDecoder
 * @property {string} id
 * @property {(input: any) => boolean} canHandle
 * @property {(input: any, context: object) => Promise<RawSourceResult>} decode
 */

class Raw_source_registry_class {
	constructor() {
		/** @type {RawSourceDecoder[]} */
		this._decoders = [];
	}

	/**
	 * Register a decoder. Later registrations are tried first so a future
	 * LibRaw adapter can take precedence for camera files.
	 * @param {RawSourceDecoder} decoder
	 */
	register(decoder) {
		if (!decoder || !decoder.id || typeof decoder.canHandle !== 'function' || typeof decoder.decode !== 'function') {
			throw new Error('Invalid RawSourceDecoder');
		}
		this._decoders = this._decoders.filter((d) => d.id !== decoder.id);
		this._decoders.unshift(decoder);
	}

	/**
	 * @param {any} input
	 * @param {object} [context]
	 * @returns {Promise<RawSourceResult>}
	 */
	async decode(input, context = {}) {
		for (var i = 0; i < this._decoders.length; i++) {
			var decoder = this._decoders[i];
			if (decoder.canHandle(input, context)) {
				return decoder.decode(input, context);
			}
		}
		throw new Error('No Raw Develop decoder can handle this source.');
	}
}

export const Raw_source_registry = new Raw_source_registry_class();

/**
 * Default decoder: active Studio image layer → full-resolution ImageData.
 * Used for JPEG/PNG and any already-rasterized layer.
 */
Raw_source_registry.register({
	id: 'raster-layer',
	canHandle(input) {
		return !!(input && input.type === 'image' && (input.link || input.data));
	},
	async decode(layer, context) {
		var Base_layers = context.Base_layers;
		if (!Base_layers || typeof Base_layers.convert_layer_to_canvas !== 'function') {
			throw new Error('Raw Develop needs Base_layers to read the raster layer.');
		}
		var canvas = Base_layers.convert_layer_to_canvas(layer.id, true);
		var ctx = canvas.getContext('2d', { willReadFrequently: true });
		var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
		return {
			width: canvas.width,
			height: canvas.height,
			imageData: imageData,
			label: layer.name || 'Layer',
			format: 'raster',
		};
	},
});

/**
 * Placeholder registration point for a future LibRaw (or similar) decoder.
 * Call Raw_source_registry.register({ id: 'libraw', canHandle, decode }) from
 * a feature module once licensing and WASM packaging are settled.
 */
export function register_future_raw_decoder(decoder) {
	Raw_source_registry.register(decoder);
}

export default Raw_source_registry;
