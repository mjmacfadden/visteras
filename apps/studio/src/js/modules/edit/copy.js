import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import Base_selection_class from './../../core/base-selection.js';
import File_save_class from './../file/save.js';
import Helper_class from './../../libs/helpers.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import Vector_manager from './../../core/vector/vector-manager.js';
import {
	vectors_to_svg,
	write_svg_clipboard,
	publish_vector_clip,
	VISTERAS_VECTOR_MIME
} from './../../core/vector/vector-svg.js';
import { CLIP_MIME, new_clip_stamp, stamp_svg } from './../../libs/clipboard-select.js';

var instance = null;

class Copy_class {

	constructor() {
		if (instance) {
			return instance;
		}
		instance = this;

		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();
		this.File_save = new File_save_class();

		document.addEventListener('keydown', (event) => {
			if (!event.key) return;
			var code = event.key.toLowerCase();
			var ctrlDown = event.ctrlKey || event.metaKey;
			if (this.Helper.is_input(event.target))
				return;

			if (code == 'c' && ctrlDown == true && event.shiftKey == false) {
				event.preventDefault();
				this.copy_to_clipboard();
			}
			if (code == 'x' && ctrlDown == true && event.shiftKey == false) {
				event.preventDefault();
				this.cut_to_clipboard();
			}
		}, false);
	}

	extract_clipboard_canvas() {
		var sel = (app.Layers && app.Layers.Base_selection) ? app.Layers.Base_selection : this.Base_layers.Base_selection;
		if (sel != null && sel.has_committed_selection()) {
			var extracted = sel.extract_selection_image(config.layer);
			if (extracted != null) {
				return extracted;
			}
		}

		var canvas = (app.Layers && typeof app.Layers.convert_layer_to_canvas === 'function')
			? app.Layers.convert_layer_to_canvas()
			: this.Base_layers.convert_layer_to_canvas();
		if (config.TRANSPARENCY == false) {
			var ctx = canvas.getContext('2d');
			ctx.globalCompositeOperation = 'destination-over';
			this.File_save.fillCanvasBackground(ctx, '#ffffff');
			ctx.globalCompositeOperation = 'source-over';
		}
		var marquee = null;
		if (typeof Base_selection_class.get_marquee_position === 'function') {
			marquee = Base_selection_class.get_marquee_position();
		} else if (app.Layers && app.Layers.Base_selection) {
			const data = app.Layers.Base_selection.get_selection_data();
			if (data && data.has_selection && data.x != null) {
				marquee = data;
			}
		}
		return {
			canvas: canvas,
			x: marquee ? marquee.x : (config.layer ? (config.layer.x || 0) : 0),
			y: marquee ? marquee.y : (config.layer ? (config.layer.y || 0) : 0),
			width: canvas.width,
			height: canvas.height,
		};
	}

	store_internal_clipboard(extracted) {
		if (extracted == null || extracted.canvas == null)
			return;
		const stamp = new_clip_stamp('studio');
		config._internal_clipboard = {
			data_url: extracted.canvas.toDataURL('image/png'),
			x: extracted.x,
			y: extracted.y,
			width: extracted.width,
			height: extracted.height,
			// Paste picks the most recent copy: nonce/ts identify this copy on the
			// system clipboard; system_write records whether it got there.
			nonce: stamp.nonce,
			ts: stamp.ts,
			system_write: 'pending',
		};
		config._clipboard_position = { x: extracted.x, y: extracted.y };
		config._internal_clipboard_fresh = true;
		return config._internal_clipboard;
	}

	get_vectors_for_clipboard() {
		var vectors = [];
		var layer = config.layer;
		if (layer && layer.type === 'vector') {
			var vid = layer.vector_id || (layer.params && layer.params.vector_id);
			var vec = null;
			if (vid) {
				vec = Vector_manager.get_vector_by_id(vid);
			}
			if (!vec && layer.vector) {
				vec = layer.vector;
			}
			if (!vec) {
				vec = Vector_manager.get_active_vector();
			}
			if (vec && vec.paths && vec.paths.length) {
				vectors.push(vec);
			}
		}
		return vectors;
	}

	async copy_vectors_to_clipboard(vectors) {
		var svgText = vectors_to_svg(vectors);
		if (!svgText) {
			alertify.error('Nothing to copy.');
			return false;
		}
		var stamp = new_clip_stamp('studio');
		svgText = stamp_svg(svgText, stamp);
		var jsonText = JSON.stringify({
			format: 'visteras-vector',
			version: 1,
			source: 'studio',
			nonce: stamp.nonce,
			ts: stamp.ts,
			vectors: vectors.map(v => v.toJSON())
		});
		var clip = {
			type: 'svg',
			svg: svgText,
			json: jsonText,
			data_url: null,
			x: 0,
			y: 0,
			width: 0,
			height: 0,
			nonce: stamp.nonce,
			ts: stamp.ts,
			system_write: 'pending'
		};
		config._internal_clipboard = clip;
		config._internal_clipboard_fresh = true;
		config._clipboard_position = null;
		publish_vector_clip(svgText, { source: 'studio', nonce: stamp.nonce });
		var ok = await write_svg_clipboard(svgText, { jsonText });
		clip.system_write = ok ? 'ok' : 'failed';
		return true;
	}

	copy_to_clipboard() {
		var vectors = this.get_vectors_for_clipboard();
		if (vectors.length > 0) {
			this.copy_vectors_to_clipboard(vectors);
			return;
		}

		var extracted = this.extract_clipboard_canvas();
		if (extracted == null) {
			alertify.error('Nothing to copy.');
			return;
		}
		var clip = this.store_internal_clipboard(extracted);

		try {
			if (navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
				var blobPromise = new Promise((resolve) => {
					extracted.canvas.toBlob((blob) => {
						resolve(blob || new Blob([], { type: 'image/png' }));
					}, 'image/png');
				});
				var items = { 'image/png': blobPromise };
				// Copy stamp as a web custom format where supported (Chromium), so paste can
				// recognise its own copy exactly; elsewhere paste compares image size.
				try {
					if (typeof ClipboardItem.supports === 'function' && ClipboardItem.supports(CLIP_MIME)) {
						items[CLIP_MIME] = new Blob([JSON.stringify({ format: 'visteras-clip', source: 'studio', nonce: clip.nonce, ts: clip.ts })], { type: CLIP_MIME });
					}
				} catch (e) { /* unsupported */ }
				navigator.clipboard.write([new ClipboardItem(items)]).then(() => {
					clip.system_write = 'ok';
				}).catch((err) => {
					clip.system_write = 'failed';
					console.warn('System clipboard write failed:', err);
				});
			} else {
				clip.system_write = 'failed';
			}
		} catch (error) {
			clip.system_write = 'failed';
			console.warn('System clipboard write error:', error);
		}
	}

	async cut_to_clipboard() {
		var sel = this.Base_layers.Base_selection;
		var had_selection = sel != null && sel.has_committed_selection();
		await this.copy_to_clipboard();
		if (had_selection) {
			var module = app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules
				? app.GUI.GUI_tools.tools_modules['selection']
				: null;
			if (module && module.object && typeof module.object.delete_selection == 'function') {
				module.object.delete_selection();
			}
		}
	}
}

export default Copy_class;
