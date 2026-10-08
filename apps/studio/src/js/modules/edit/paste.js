import app from './../../app.js';
import config from './../../config.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import { Insert_vector_action } from './../../actions/vector/insert-vector.js';
import { Add_smart_source_action } from './../../actions/smart-layer.js';
import { v4 as uuid } from 'uuid';
import {
	is_visteras_vector_svg,
	svg_pixel_size,
	compute_paste_placement,
	svg_data_url,
	smart_source_document
} from './../../libs/vector-paste.js';
import {
	svg_to_vectors,
	read_svg_from_clipboard_event,
	looks_like_svg
} from './../../core/vector/vector-svg.js';

class Edit_paste_class {

	async paste() {
		if (config._internal_clipboard != null) {
			this.paste_internal();
			return;
		}
		if (window.__visteras_last_cross_app_svg) {
			const ok = await this.paste_svg_text(window.__visteras_last_cross_app_svg);
			if (ok) return;
		}
		const ok = await this.paste_from_system_svg(null);
		if (ok) return;
		if (await this.paste_system_image()) return;
		alertify.error('Nothing to paste. Copy an image or vector to the clipboard first.');
	}

	/** Read the first raster image from a paste event or the system clipboard. */
	async read_system_image(clipboardEvent = null) {
		if (clipboardEvent && clipboardEvent.clipboardData) {
			const items = clipboardEvent.clipboardData.items || [];
			for (let i = 0; i < items.length; i++) {
				if ((items[i].type || '').indexOf('image/') !== 0) continue;
				const blob = items[i].getAsFile && items[i].getAsFile();
				if (blob) return this.blob_to_data_url(blob);
			}
		}
		if (!navigator.clipboard || !navigator.clipboard.read) return null;
		const items = await navigator.clipboard.read();
		for (const item of items) {
			for (const type of (item.types || [])) {
				if (type.indexOf('image/') !== 0) continue;
				return this.blob_to_data_url(await item.getType(type));
			}
		}
		return null;
	}

	async paste_system_image(clipboardEvent = null) {
		try {
			const data_url = await this.read_system_image(clipboardEvent);
			if (!data_url) return false;
			const dims = await this.load_image_dimensions(data_url);
			app.State.do_action(new app.Actions.Insert_layer_action({
				name: 'Paste', type: 'image', data: data_url,
				x: 0, y: 0, width: dims.width, height: dims.height,
				width_original: dims.width, height_original: dims.height,
			}, false));
			return true;
		} catch (error) {
			return false;
		}
	}

	/**
	 * Paste SVG text. A Visteras Vector copy becomes ONE Smart Layer (Promise<boolean>);
	 * other SVG (Studio's own vector copies, plain SVG) becomes editable vector layers.
	 */
	paste_svg_text(svgText) {
		if (!svgText || !looks_like_svg(svgText)) {
			return false;
		}
		if (is_visteras_vector_svg(svgText)) {
			return this.paste_vector_smart(svgText).catch((error) => {
				console.warn('Vector Smart Object paste failed, pasting as vector layers:', error);
				return this.paste_svg_as_vectors(svgText);
			});
		}
		return this.paste_svg_as_vectors(svgText);
	}

	/** Visible part of the document in world (document px) coordinates, or null. */
	visible_world_rect() {
		try {
			const canvas = document.getElementById('canvas_minipaint');
			if (!canvas || !app.Layers || typeof app.Layers.get_world_coords !== 'function') return null;
			const a = app.Layers.get_world_coords(0, 0);
			const b = app.Layers.get_world_coords(canvas.width, canvas.height);
			return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
		} catch (e) {
			return null;
		}
	}

	/** Render an SVG string to a canvas of the given pixel size. */
	render_svg(svg_url, width, height) {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => {
				const canvas = document.createElement('canvas');
				canvas.width = width;
				canvas.height = height;
				canvas.getContext('2d').drawImage(img, 0, 0, width, height);
				resolve(canvas);
			};
			img.onerror = () => reject(new Error('Could not render the pasted SVG.'));
			img.src = svg_url;
		});
	}

	/**
	 * Illustrator -> Photoshop "Paste as Smart Object": the whole Vector selection
	 * becomes ONE Smart Layer whose embedded source holds the SVG group, rendered
	 * 1:1 and centered in the visible canvas area.
	 */
	async paste_vector_smart(svgText) {
		const size = svg_pixel_size(svgText);
		if (!size) throw new Error('Pasted SVG has no size.');
		const place = compute_paste_placement(size, config.WIDTH, config.HEIGHT, this.visible_world_rect());
		const svg_url = svg_data_url(svgText);
		const preview = await this.render_svg(svg_url, place.width, place.height);
		const name = 'Vector Smart Object';
		const version = typeof VERSION !== 'undefined' ? VERSION : '4.0.0';
		const source = {
			id: uuid(), revision: 1, width: place.width, height: place.height,
			document: smart_source_document({ svg_url, width: place.width, height: place.height, name, version }),
			preview: preview.toDataURL('image/png'), link: preview,
		};
		const result = await app.State.do_action(new app.Actions.Bundle_action('paste_vector_smart', 'Paste Vector Smart Object', [
			new Add_smart_source_action(source),
			new app.Actions.Insert_layer_action({
				name, type: 'smart', smart_source_id: source.id, link: preview,
				x: place.x, y: place.y, width: place.width, height: place.height,
				width_original: place.width, height_original: place.height,
			}, false),
		]));
		if (result && result.status && result.status !== 'completed') throw (result.reason || new Error('Paste was cancelled.'));
		if (app.GUI && app.GUI.GUI_layers) app.GUI.GUI_layers.render_layers();
		config.need_render = true;
		return true;
	}

	paste_svg_as_vectors(svgText) {
		var vectors = svg_to_vectors(svgText);
		if (!vectors.length) {
			alertify.error('Could not parse SVG from clipboard.');
			return false;
		}
		var actions = vectors.map(function (vec) {
			return new Insert_vector_action(vec);
		});
		if (actions.length === 1) {
			app.State.do_action(actions[0]);
		} else {
			app.State.do_action(
				new app.Actions.Bundle_action('paste_vectors', 'Paste Vectors', actions)
			);
		}
		if (app.GUI && app.GUI.GUI_vectors) {
			app.GUI.GUI_vectors.render_vectors();
		}
		if (app.GUI && app.GUI.GUI_layers) {
			app.GUI.GUI_layers.render_layers();
		}
		config.need_render = true;
		return true;
	}

	async paste_from_system_svg(clipboardEvent) {
		var svgText = await read_svg_from_clipboard_event(clipboardEvent || null);
		if (!svgText) return false;
		return this.paste_svg_text(svgText);
	}

	paste_internal() {
		var clip = config._internal_clipboard;
		if (clip == null) {
			alertify.error('Nothing to paste.');
			return;
		}

		// Vector / SVG clipboard (from Studio or Vector app)
		if (clip.type === 'svg' && clip.svg) {
			this.paste_svg_text(clip.svg);
			return;
		}

		if (clip.data_url == null) {
			alertify.error('Nothing to paste.');
			return;
		}

		app.State.do_action(
			new app.Actions.Insert_layer_action({
				name: 'Paste',
				type: 'image',
				data: clip.data_url,
				x: clip.x || 0,
				y: clip.y || 0,
				width: clip.width,
				height: clip.height,
				width_original: clip.width,
				height_original: clip.height,
			}, false)
		);
		// Offset slightly for consecutive pastes
		clip.x = (clip.x || 0) + 10;
		clip.y = (clip.y || 0) + 10;
	}

	async paste_as_new() {
		if (app.GUI && app.GUI.modules && app.GUI.modules['file/new']) {
			return await app.GUI.modules['file/new'].paste_as_new();
		}
	}

	async paste_to_fit() {
		var clip = config._internal_clipboard;

		// 1. Prefer the internal clipboard (in-app copy - preserves alpha, shapes, etc.)
		if (clip == null || clip.data_url == null) {
			// 2. Otherwise read an image from the actual system clipboard
			try {
				if (navigator.clipboard && navigator.clipboard.read) {
					var permission = await this.request_clipboard_permission();
					if (!permission) {
						alertify.error('Clipboard permission denied.');
						return;
					}
					var items = await navigator.clipboard.read();
					var data_url = null;
					var img_w = null;
					var img_h = null;
					for (var i = 0; i < items.length; i++) {
						var types = items[i].types || [];
						for (var t = 0; t < types.length; t++) {
							if (types[t].indexOf('image') !== -1) {
								var blob = await items[i].getType(types[t]);
								data_url = await this.blob_to_data_url(blob);
								var dims = await this.load_image_dimensions(data_url);
								img_w = dims.width;
								img_h = dims.height;
								break;
							}
						}
						if (data_url != null) break;
					}
					if (data_url == null) {
						alertify.error('No image found on the clipboard.');
						return;
					}
					this.insert_fitted(data_url, img_w, img_h);
					return;
				}
			} catch (error) {
				if (await this.paste_system_image()) return;
				alertify.error('Could not read the clipboard.');
				return;
			}
			alertify.error('Nothing to paste. Copy an image first.');
			return;
		}

		this.insert_fitted(clip.data_url, clip.width, clip.height);
	}

	insert_fitted(data_url, img_width, img_height) {
		var canvas_width = config.WIDTH;
		var canvas_height = config.HEIGHT;

		if (!canvas_width || !canvas_height || !img_width || !img_height) {
			alertify.error('Invalid canvas or image dimensions.');
			return;
		}

		// Calculate scale factor to fit within canvas while maintaining aspect ratio
		var scale_x = canvas_width / img_width;
		var scale_y = canvas_height / img_height;
		var scale = Math.min(scale_x, scale_y);

		// Calculate new dimensions
		var new_width = Math.round(img_width * scale);
		var new_height = Math.round(img_height * scale);

		// Center the image on the canvas
		var x = Math.round((canvas_width - new_width) / 2);
		var y = Math.round((canvas_height - new_height) / 2);

		app.State.do_action(
			new app.Actions.Insert_layer_action({
				name: 'Paste to Fit',
				type: 'image',
				data: data_url,
				x: x,
				y: y,
				width: new_width,
				height: new_height,
				width_original: img_width,
				height_original: img_height,
			}, false)
		);
	}

	async request_clipboard_permission() {
		try {
			if (navigator.permissions && navigator.permissions.query) {
				var result = await navigator.permissions.query({ name: 'clipboard-read' });
				if (result.state === 'denied') return false;
				if (result.state === 'granted') return true;
			}
			// Assume the browser will prompt on read
			return true;
		} catch (error) {
			return true;
		}
	}

	blob_to_data_url(blob) {
		return new Promise((resolve, reject) => {
			var reader = new FileReader();
			reader.onload = function () {
				resolve(reader.result);
			};
			reader.onerror = function (error) {
				reject(error);
			};
			reader.readAsDataURL(blob);
		});
	}

	load_image_dimensions(data_url) {
		return new Promise((resolve, reject) => {
			var img = new Image();
			img.onload = function () {
				resolve({ width: img.width, height: img.height });
			};
			img.onerror = function (error) {
				reject(error);
			};
			img.src = data_url;
		});
	}
}

export default Edit_paste_class;
