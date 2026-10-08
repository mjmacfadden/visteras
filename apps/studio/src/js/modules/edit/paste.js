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
	smart_source_document,
	pick_clipboard_svg
} from './../../libs/vector-paste.js';
import {
	CLIP_MIME,
	choose_paste_source,
	svg_clip_stamp,
	parse_clip_json
} from './../../libs/clipboard-select.js';
import {
	svg_to_vectors,
	read_svg_from_clipboard_event,
	looks_like_svg,
	VISTERAS_VECTOR_MIME
} from './../../core/vector/vector-svg.js';

// ⌘V fallback timer: cancelled when the native paste event arrives.
let pending_shortcut_paste = null;

class Edit_paste_class {

	/**
	 * Paste the MOST RECENT copy. The system clipboard is read first (the paste
	 * event's clipboardData, else navigator.clipboard.read()); Studio's internal
	 * copy is used only when the clipboard holds that same copy, when the copy
	 * never reached the clipboard, or when the clipboard is empty / unreadable.
	 * @param {ClipboardEvent} [clipboardEvent]
	 */
	async paste(clipboardEvent = null) {
		this.cancel_shortcut_paste();
		const event = clipboardEvent && clipboardEvent.clipboardData ? clipboardEvent : null;
		// Event data must be read synchronously, before the first await.
		const raw = event ? this.snapshot_from_event(event) : await this.snapshot_from_api();
		const system = await this.measure_snapshot(raw);
		const decision = choose_paste_source({ system, internal: this.internal_clip_info(), cross: this.cross_clip_info() });
		window.__visteras_last_paste_decision = { use: decision.use, reason: decision.reason, status: system.status };
		switch (decision.use) {
			case 'internal':
				config._internal_clipboard_fresh = false;
				this.paste_internal();
				return true;
			case 'svg':
				if (await this.paste_svg_text(decision.svg)) return true;
				if (system.file) return this.paste_image_file(system.file, system.image);
				return false;
			case 'image':
				return this.paste_image_file(system.file, system.image);
			case 'text':
				alertify.message('The clipboard holds text, not an image or vector. Use the Type tool to paste text.');
				return false;
			default:
				alertify.error(decision.reason === 'unreadable'
					? 'Could not read the clipboard. Allow clipboard access, or use ⌘V / Ctrl+V.'
					: 'Nothing to paste. Copy an image or vector to the clipboard first.');
				return false;
		}
	}

	/** ⌘V: wait briefly for the native paste event (no permission needed), else read the clipboard. */
	paste_shortcut() {
		this.cancel_shortcut_paste();
		pending_shortcut_paste = setTimeout(() => {
			pending_shortcut_paste = null;
			this.paste(null);
		}, 150);
	}

	cancel_shortcut_paste() {
		if (pending_shortcut_paste) {
			clearTimeout(pending_shortcut_paste);
			pending_shortcut_paste = null;
		}
	}

	internal_clip_info() {
		const clip = config._internal_clipboard;
		if (!clip || (!clip.data_url && !(clip.type === 'svg' && clip.svg))) return null;
		return {
			kind: clip.type === 'svg' ? 'svg' : 'raster', nonce: clip.nonce || null, ts: clip.ts || 0,
			width: clip.width, height: clip.height, svg: clip.svg || null, system_write: clip.system_write || null,
		};
	}

	cross_clip_info() {
		if (!window.__visteras_last_cross_app_svg) return null;
		return { svg: window.__visteras_last_cross_app_svg, ts: window.__visteras_last_cross_app_ts || 0, nonce: window.__visteras_last_cross_app_nonce || null };
	}

	/** Synchronous snapshot of a paste event's clipboardData. */
	snapshot_from_event(e) {
		const dt = e.clipboardData;
		const types = dt.types ? Array.prototype.slice.call(dt.types) : [];
		const get = (t) => { try { return dt.getData(t) || ''; } catch (err) { return ''; } };
		let file = null;
		const items = dt.items || [];
		for (let i = 0; i < items.length; i++) {
			const it = items[i];
			if (it.kind === 'file' && (it.type || '').indexOf('image/') === 0 && it.type !== 'image/svg+xml') {
				file = it.getAsFile ? it.getAsFile() : null;
				if (file) break;
			}
		}
		const custom = {};
		for (const t of [CLIP_MIME, VISTERAS_VECTOR_MIME]) if (types.indexOf(t) !== -1) custom[t] = get(t);
		return { types, text: get('text/plain'), svg_mime: types.indexOf('image/svg+xml') !== -1 ? get('image/svg+xml') : '', html: get('text/html'), file, custom };
	}

	/** Snapshot via the async Clipboard API; status 'unreadable' when denied / unsupported. */
	async snapshot_from_api() {
		const out = { types: [], text: '', svg_mime: '', html: '', file: null, custom: {}, unreadable: false };
		try {
			if (navigator.clipboard && navigator.clipboard.read) {
				const items = await navigator.clipboard.read();
				for (const item of items) {
					for (const type of (item.types || [])) {
						out.types.push(type);
						if (type === 'text/plain' || type === 'text/html' || type === 'image/svg+xml' || type === CLIP_MIME || type === VISTERAS_VECTOR_MIME) {
							const text = await (await item.getType(type)).text();
							if (type === 'text/plain') out.text = text;
							else if (type === 'text/html') out.html = text;
							else if (type === 'image/svg+xml') out.svg_mime = text;
							else out.custom[type] = text;
						} else if (type.indexOf('image/') === 0 && !out.file) {
							out.file = await item.getType(type);
						}
					}
				}
				return out;
			}
			if (navigator.clipboard && navigator.clipboard.readText) {
				// Text-only API: an empty result may hide an image, so it is "unreadable".
				out.text = await navigator.clipboard.readText();
				if (out.text) out.types.push('text/plain');
				else out.unreadable = true;
				return out;
			}
		} catch (error) {
			// Permission denied / document not focused.
		}
		out.unreadable = true;
		return out;
	}

	/** Normalise a raw snapshot for choose_paste_source (decodes image size). */
	async measure_snapshot(raw) {
		if (!raw || raw.unreadable) return { status: 'unreadable' };
		// Raw text/plain first: Chrome rewrites image/svg+xml (and hides it from paste
		// events); a Vector-marked candidate (attr / class / copy group / custom JSON) wins.
		const svg = pick_clipboard_svg({ plain: raw.text, svg: raw.svg_mime, html: raw.html, json: Object.values(raw.custom || {}) });
		const text = svg ? null : ((raw.text || '').trim() ? raw.text : ((raw.html || '').trim() ? raw.html : null));
		let stamp = svg ? svg_clip_stamp(svg) : null;
		for (const t of [CLIP_MIME, VISTERAS_VECTOR_MIME]) if (!stamp && raw.custom && raw.custom[t]) stamp = parse_clip_json(raw.custom[t]);
		let image = null;
		if (raw.file) {
			image = { width: null, height: null };
			try {
				const url = await this.blob_to_data_url(raw.file);
				const dims = await this.load_image_dimensions(url);
				image = { width: dims.width, height: dims.height, data_url: url };
			} catch (e) { /* undecodable image: still foreign content */ }
		}
		if (!svg && !text && !image && !stamp) {
			return { status: raw.types && raw.types.length ? 'ok' : 'empty', svg: null, text: null, image: null, stamp: null };
		}
		return { status: 'ok', svg, text, image, stamp, file: raw.file };
	}

	/** Foreign image: one layer, 1:1, centered in the visible canvas (Photoshop). */
	async paste_image_file(file, image) {
		try {
			const data_url = (image && image.data_url) || (file ? await this.blob_to_data_url(file) : null);
			if (!data_url) return false;
			const dims = image && image.width ? image : await this.load_image_dimensions(data_url);
			const place = compute_paste_placement(dims, config.WIDTH, config.HEIGHT, this.visible_world_rect(), { max_factor: Infinity, max_side: Infinity });
			await app.State.do_action(new app.Actions.Insert_layer_action({
				name: 'Paste', type: 'image', data: data_url,
				x: place.x, y: place.y, width: dims.width, height: dims.height,
				width_original: dims.width, height_original: dims.height,
			}, false));
			return true;
		} catch (error) {
			alertify.error('Could not paste the clipboard image.');
			return false;
		}
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
