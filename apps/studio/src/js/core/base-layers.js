/*
 * miniPaint - https://github.com/viliusle/miniPaint
 * author: Vilius L.
 */

import app from "./../app.js";
import config from "./../config.js";
import Base_gui_class from "./base-gui.js";
import Base_selection_class from "./base-selection.js";
import Image_trim_class from "./../modules/image/trim.js";
import View_ruler_class from "./../modules/view/ruler.js";
import View_guides_class from "./../modules/view/guides.js";
import zoomView from "./../libs/zoomView.js";
import Helper_class from "./../libs/helpers.js";
import Mask_class from "./../modules/mask/mask.js";
import alertify from "./../../../node_modules/alertifyjs/build/alertify.min.js";
import { create_renderer, get_renderer, switch_renderer } from "./renderer/index.js";
import Composite_cache_class from "./renderer/composite-cache.js";
import { is_group, is_effectively_visible, get_descendant_ids } from "./../libs/layer-tree.js";
import { is_layer_clipped, get_render_composition } from './../libs/layer-clip.js';
import Vector_renderer from "./vector/vector-renderer.js";

var instance = null;

/**
 * Layers class - manages layers. Each layer is object with various types. Keys:
 * - id (int)
 * - link (image)
 * - parent_id (int) — 0 = document root; otherwise id of a type==="group" parent
 * - name (string)
 * - type (string) — image|text|brush|pencil|gradient|adjustment|group|...
 * - opened (bool) — groups only: expanded in Layers panel (ag-psd `opened`)
 * - x (int)
 * - y (int)
 * - width (int)
 * - height (int)
 * - width_original (int)
 * - height_original (int)
 * - visible (bool) — hiding a group hides its contents (effective visibility)
 * - is_vector (bool)
 * - hide_selection_if_active (bool)
 * - opacity (0-100)
 * - order (int) — higher = nearer top of stack / Layers panel
 * - composition (string) — groups: "pass-through" (default) or a blend mode
 * - rotate (int) 0-359
 * - data (various data here)
 * - params (object)
 * - color {hex}
 * - status (string)
 * - filters (array)
 * - render_function (function)
 *
 * Groups are first-class layers (type==="group") nested via parent_id.
 * See src/js/libs/layer-tree.js. Compositor skips group nodes (pass-through);
 * child paint order follows global `order`.
 */
class Base_layers_class {
	constructor() {
		//singleton
		if (instance) {
			return instance;
		}
		instance = this;

		this.Base_gui = new Base_gui_class();
		this.Helper = new Helper_class();
		this.Image_trim = new Image_trim_class();
		this.View_ruler = new View_ruler_class();
		this.View_guides = new View_guides_class();

		this.canvas = document.getElementById("canvas_minipaint");
		this.ctx = document.getElementById("canvas_minipaint").getContext("2d");
		this.ctx_preview = document
			.getElementById("canvas_preview")
			.getContext("2d");
		this.last_zoom = 1;
		this.auto_increment = 1;
		this.stable_dimensions = [];
		this.debug_rendering = false;
		this.render_success = null;
		this.disabled_filter_id = null;
		this.Composite_cache = new Composite_cache_class();
		this.render_frame_request = null;
	}

	/**
	 * do preparation on start
	 */
	init() {
		this.init_zoom_lib();

		// Create white-filled canvas for the background layer
		var bgCanvas = document.createElement('canvas');
		bgCanvas.width = config.WIDTH;
		bgCanvas.height = config.HEIGHT;
		var bgCtx = bgCanvas.getContext('2d');
		bgCtx.fillStyle = '#ffffff';
		bgCtx.fillRect(0, 0, config.WIDTH, config.HEIGHT);

		new app.Actions.Insert_layer_action({
			name: 'Background',
			locked: true,
			type: 'image',
			data: bgCanvas.toDataURL(),
		}).do();

		var sel_config = {
			enable_background: false,
			enable_borders: true,
			enable_controls: false,
			enable_rotation: false,
			enable_move: false,
			data_function: function () {
				if (config.mask_active === true && config.layer && config.layer.mask && config.layer.mask.linked === false) {
					return config.layer.mask;
				}
				return config.layer;
			},
		};
		this.Base_selection = new Base_selection_class(
			this.ctx,
			sel_config,
			"main"
		);

		// Initialize renderer (defaults to Canvas 2D if WebGL unavailable)
		var renderer_mode = config.RENDERER || 'auto';
		this.active_renderer = create_renderer(renderer_mode, config.WIDTH, config.HEIGHT);

		document.addEventListener('visibilitychange', () => {
			if (!document.hidden) {
				this.invalidate({ viewport: true });
				if (this.Base_selection && this.Base_selection.is_marching_ants_active()) {
					this.Base_selection.start_marching_ants();
				}
			} else {
				if (this.Base_selection) {
					this.Base_selection.stop_marching_ants();
				}
			}
		});

		this.invalidate({ document: true, preview: true, details: true, ruler: true });
	}

	init_zoom_lib() {
		zoomView.setBounds(0, 0, config.WIDTH, config.HEIGHT);
		zoomView.setContext(this.ctx);
		this.stable_dimensions = [config.WIDTH, config.HEIGHT];
	}

	pre_render() {
		this.ctx.save();
		zoomView.canvasDefault();
		this.ctx.clearRect(
			0,
			0,
			config.WIDTH * config.ZOOM,
			config.HEIGHT * config.ZOOM
		);
	}

	after_render() {
		config.need_render = false;
		config.need_render_changed_params = false;
		this.ctx.restore();
		zoomView.canvasDefault();

		// Manage marching ants animation on overlay without re-rendering the full document
		if (this.Base_selection && this.Base_selection.is_marching_ants_active()) {
			this.Base_selection.start_marching_ants();
		} else if (this.Base_selection) {
			this.Base_selection.stop_marching_ants();
		}

		if (this.Base_gui && this.Base_gui.GUI_timeline && this.Base_gui.GUI_timeline.is_visible && !this.Base_gui.GUI_timeline.is_playing) {
			this.Base_gui.GUI_timeline.update_active_thumbnail();
		}
	}

	/**
	 * Request a render with an explicit scope. Existing callers that only set
	 * config.need_render remain conservative and trigger a full document build.
	 */
	invalidate(request = {}) {
		const cache = this.Composite_cache;
		if (request.viewport === true && !request.document && !request.full) {
			cache.viewportOnly = true;
		} else {
			cache.viewportOnly = false;
		}
		cache.explicitRequest = true;
		if (request.document === true || request.full === true)
			cache.invalidate_document();
		if (request.preview === true) cache.previewDirty = true;
		if (request.details === true) cache.detailsDirty = true;
		if (request.ruler === true) cache.rulerDirty = true;
		config.need_render = true;
	}

	/**
	 * Schedules a single display frame. The config.need_render setter calls this
	 * as a compatibility bridge for legacy callers that still set that flag.
	 */
	request_render() {
		if (document.hidden)
			return;
		if (this.render_frame_request != null)
			return;
		this.render_frame_request = requestAnimationFrame(() => {
			this.render_frame_request = null;
			this.render(true);
		});
	}

	/**
	 * Recompose a draft top layer over a cached prefix. This is deliberately
	 * narrow: unsupported stacks fall back to a normal full invalidation.
	 */
	render_interactive_layer(layerId) {
		this.Composite_cache.explicitRequest = true;
		this.Composite_cache.pendingInteractiveLayerId = layerId;
		config.need_render = true;
	}

	can_render_interactive_layer(layer, layers) {
		if (!layer || layer.visible === false || layer.type == null)
			return false;
		if (layer.type === 'adjustment')
			return false;
		// The initial fast path intentionally handles only an independent,
		// top-most normal layer. Masks, filters, clipping and blend modes keep
		// using the exact legacy compositor.
		if (is_layer_clipped(layer) || layer.composition !== 'source-over' || (layer.filters && layer.filters.length)
			|| (layer.mask && layer.mask.enabled !== false))
			return false;
		return layers[0] && layers[0].id === layer.id
			&& (!layers[1] || !is_layer_clipped(layers[1]));
	}

	render_document_cache(layers) {
		const cache = this.Composite_cache;
		const ctx = cache.documentCanvas.getContext('2d');
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, config.WIDTH, config.HEIGHT);
		const tempCanvas = this.create_new_canvas(null, config.WIDTH, config.HEIGHT);
		this.render_objects(ctx, tempCanvas, layers, () => ctx.save());
		this.render_vectors(ctx);
		ctx.restore();
		cache.documentDirty = false;
		cache.previewDirty = true;
		cache.activeLayerId = null;
	}

	render_vectors(ctx) {
		if (!config.vectors || !Array.isArray(config.vectors)) return;
		for (let i = 0; i < config.vectors.length; i++) {
			const vec = config.vectors[i];
			if (vec && vec.visible) {
				const hasLayer = config.layers && config.layers.some(l => l.type === 'vector' && (l.vector_id === vec.id || (l.params && l.params.vector_id === vec.id)));
				if (!hasLayer) {
					Vector_renderer.render_vector(ctx, vec);
				}
			}
		}
	}

	render_interactive_layer_cache(layer, layers) {
		const cache = this.Composite_cache;
		if (!this.can_render_interactive_layer(layer, layers))
			return false;

		const documentCtx = cache.documentCanvas.getContext('2d');
		const prefixCtx = cache.prefixCanvas.getContext('2d');
		if (cache.activeLayerId !== layer.id) {
			prefixCtx.setTransform(1, 0, 0, 1, 0, 0);
			prefixCtx.clearRect(0, 0, config.WIDTH, config.HEIGHT);
			const tempCanvas = this.create_new_canvas(null, config.WIDTH, config.HEIGHT);
			this.render_objects(prefixCtx, tempCanvas, layers.slice(1), () => prefixCtx.save());
			prefixCtx.restore();
		}

		documentCtx.setTransform(1, 0, 0, 1, 0, 0);
		documentCtx.clearRect(0, 0, config.WIDTH, config.HEIGHT);
		documentCtx.drawImage(cache.prefixCanvas, 0, 0);
		const comp = get_render_composition(layer);
		if (this._is_custom_blend(comp)) {
			if (!this._custom_blend_canvas) {
				this._custom_blend_canvas = document.createElement('canvas');
			}
			const bCanvas = this._custom_blend_canvas;
			if (bCanvas.width !== config.WIDTH || bCanvas.height !== config.HEIGHT) {
				bCanvas.width = config.WIDTH;
				bCanvas.height = config.HEIGHT;
			}
			const bCtx = bCanvas.getContext('2d');
			bCtx.setTransform(1, 0, 0, 1, 0, 0);
			bCtx.clearRect(0, 0, config.WIDTH, config.HEIGHT);
			bCtx.globalAlpha = layer.opacity / 100;
			bCtx.globalCompositeOperation = 'source-over';
			this.render_object(bCtx, layer);
			this._composite_custom_blend(documentCtx, bCanvas, comp);
		} else {
			documentCtx.globalAlpha = layer.opacity / 100;
			documentCtx.globalCompositeOperation = comp;
			this.render_object(documentCtx, layer);
		}
		documentCtx.globalAlpha = 1;
		documentCtx.globalCompositeOperation = 'source-over';
		cache.mark_interactive(layer.id);
		return true;
	}

	render_cached_preview() {
		const cache = this.Composite_cache;
		const w = this.Base_gui.GUI_preview.PREVIEW_SIZE.w;
		const h = this.Base_gui.GUI_preview.PREVIEW_SIZE.h;
		this.ctx_preview.save();
		this.ctx_preview.setTransform(1, 0, 0, 1, 0, 0);
		this.ctx_preview.clearRect(0, 0, w, h);
		this.ctx_preview.drawImage(cache.documentCanvas, 0, 0, w, h);
		this.ctx_preview.restore();
		this.Base_gui.GUI_preview.render_preview_active_zone();
		if (this.Base_gui.GUI_timeline && this.Base_gui.GUI_timeline.is_visible && !this.Base_gui.GUI_timeline.is_playing) {
			this.Base_gui.GUI_timeline.update_active_thumbnail();
		}
		cache.previewDirty = false;
	}

	/**
	 * renders all layers objects on main canvas
	 *
	 * @param {bool} force
	 */
	render(force) {
		if (force !== true) {
			// Legacy callers do not describe what changed, so preserve their
			// correctness by invalidating the document cache. New callers use
			// invalidate({ viewport: true }) or render_interactive_layer().
			this.invalidate({ document: true, preview: true, details: true });
			return;
		}

		if (
			this.stable_dimensions[0] != config.WIDTH ||
			this.stable_dimensions[1] != config.HEIGHT
		) {
			//dimensions changed - re-init zoom lib
			this.init_zoom_lib();
		}

		if (config.need_render == true) {
			const cache = this.Composite_cache;
			const zoom_changed = this.last_zoom != config.ZOOM;
			// Capture before clearing — WebGL path reuses the last offscreen
			// composite on viewport-only pan/zoom (same idea as documentCanvas).
			const viewport_only = cache.viewportOnly === true;
			// A direct write to config.need_render is an old, unclassified
			// invalidation. It must stay conservative. Explicit invalidations can
			// safely request a viewport-only frame.
			if (!cache.viewportOnly && (!cache.explicitRequest || cache.pendingInteractiveLayerId != null)) {
				if (cache.pendingInteractiveLayerId == null) {
					cache.invalidate_document();
				}
				cache.detailsDirty = true;
				cache.rulerDirty = true;
			}
			cache.viewportOnly = false;
			cache.explicitRequest = false;
			cache.ensure_size(config.WIDTH, config.HEIGHT);
			this.render_success = null;

			if (this.debug_rendering === true) {
				console.log("Rendering...");
			}

			if (this.last_zoom != null && this.last_zoom > 0 && Math.abs(this.last_zoom - config.ZOOM) > 0.0001) {
				//change zoom
				var centerX = (this.Base_gui && this.Base_gui.GUI_preview && this.Base_gui.GUI_preview.zoom_data) ? this.Base_gui.GUI_preview.zoom_data.x : (config.visible_width / 2);
				var centerY = (this.Base_gui && this.Base_gui.GUI_preview && this.Base_gui.GUI_preview.zoom_data) ? this.Base_gui.GUI_preview.zoom_data.y : (config.visible_height / 2);
				zoomView.scaleAt(
					centerX,
					centerY,
					config.ZOOM / this.last_zoom
				);
			} else if (this.last_zoom == null || Math.abs(zoomView.getScale() - config.ZOOM) > 0.0001) {
				zoomView.reset(config.ZOOM || 1);
			} else if (this.Base_gui && this.Base_gui.GUI_preview && this.Base_gui.GUI_preview.zoom_data && this.Base_gui.GUI_preview.zoom_data.move_pos != null) {
				//move visible window
				var pos = this.Base_gui.GUI_preview.zoom_data.move_pos;
				var pos_global = zoomView.toScreen(pos);
				zoomView.move(-pos_global.x, -pos_global.y);
				this.Base_gui.GUI_preview.zoom_data.move_pos = null;
			}

			//take data
			var layers_sorted = this.get_sorted_layers();

			// Check if active renderer supports direct layer compositing (WebGL)
			// and can faithfully render every layer; otherwise use the exact
			// Canvas 2D pipeline for that frame (filters, non-source-over
			// composition modes, etc.)
			var renderer = get_renderer();
			var webgl_usable = renderer && renderer.type === 'webgl' && renderer.available
				&& (!renderer.can_render_layers || renderer.can_render_layers(layers_sorted, this.disabled_filter_id));
			if (webgl_usable) {
				cache.pendingInteractiveLayerId = null;

				// ---- WebGL rendering path ----
				// Renders layers to offscreen WebGL canvas, then composites
				// onto main canvas. Overlays remain Canvas 2D.

				// Prepare main canvas (clear, save state)
				this.pre_render();

				// Apply zoom transform to main canvas for overlays
				zoomView.apply();

				// Viewport-only: reuse last full-scale WebGL composite (pan/zoom).
				var skip_webgl_rebuild = viewport_only
					&& typeof renderer.has_cached_composite === 'function'
					&& renderer.has_cached_composite();

				if (!skip_webgl_rebuild) {
					// WebGL renders layers to its offscreen canvas
					renderer.clear();
					renderer.begin_frame();
					renderer.render_layers(
						layers_sorted,
						config.ZOOM,
						{ x: 0, y: 0 },
						config.WIDTH,
						config.HEIGHT
					);
					renderer.end_frame();
				}

				// Composite WebGL output onto main canvas
				// The WebGL canvas contains the composited layers at document
				// resolution. Apply the zoomView transform (zoom + pan) so the
				// visible area follows navigator/pan/zoom like the 2D path.
				var glCanvas = renderer.getCanvas();
				if (glCanvas) {
					this.ctx.save();
					zoomView.apply();
					this.ctx.filter = "none";
					this.ctx.imageSmoothingEnabled = (config.ZOOM < 1);
					this.ctx.drawImage(glCanvas, 0, 0, config.WIDTH, config.HEIGHT);

					this.ctx.restore();
					zoomView.apply();
				}

				// Draw grid, guides, selection, tool overlays on main canvas (2D)
				this.Base_gui.draw_grid(this.ctx);
				this.Base_gui.draw_guides();
				if (this.Base_selection && typeof this.Base_selection.draw_selection === 'function') {
					this.Base_selection.draw_selection();
				}
				this.render_overlay();

				// Render preview
				if (cache.previewDirty) {
					var previewGlCanvas = renderer.getCanvas();
					if (previewGlCanvas) {
						var pw = this.Base_gui.GUI_preview.PREVIEW_SIZE.w;
						var ph = this.Base_gui.GUI_preview.PREVIEW_SIZE.h;
						this.ctx_preview.save();
						this.ctx_preview.setTransform(1, 0, 0, 1, 0, 0);
						this.ctx_preview.clearRect(0, 0, pw, ph);
						this.ctx_preview.drawImage(previewGlCanvas, 0, 0, pw, ph);
						this.ctx_preview.restore();
					} else {
						this.render_preview(layers_sorted);
					}
					cache.previewDirty = false;
				}
				this.Base_gui.GUI_preview.render_preview_active_zone();

				// Reset
				this.after_render();
			} else {
				// ---- Canvas 2D document cache ----
				let interactive_rendered = false;
				if (cache.pendingInteractiveLayerId != null) {
					const layer = this.get_layer(cache.pendingInteractiveLayerId, true);
					if (layer) {
						interactive_rendered = this.render_interactive_layer_cache(layer, layers_sorted);
					}
					cache.pendingInteractiveLayerId = null;
					if (!interactive_rendered)
						cache.invalidate_document();
				}
				if (!interactive_rendered && cache.documentDirty) {
					this.render_document_cache(layers_sorted);
				}

				// Presentation is deliberately separate from composition. Zoom, pan,
				// selection animation, guides and tool controls only draw this bitmap.
				this.pre_render();
				zoomView.apply();
				this.ctx.imageSmoothingEnabled = (config.ZOOM < 1);
				this.ctx.drawImage(cache.documentCanvas, 0, 0);
				this.Base_gui.draw_grid(this.ctx);
				this.Base_gui.draw_guides();
				if (this.Base_selection && typeof this.Base_selection.draw_selection === 'function') {
					this.Base_selection.draw_selection();
				}
				this.render_overlay();

				if (cache.previewDirty) {
					this.render_cached_preview();
				} else {
					// Navigation still changes the viewport rectangle even when the
					// document thumbnail itself is unchanged.
					this.Base_gui.GUI_preview.render_preview_active_zone();
				}

				this.after_render();
			}

			this.last_zoom = config.ZOOM;

			if (cache.detailsDirty) {
				this.Base_gui.GUI_details.render_details();
				if (this.Base_gui.GUI_properties && typeof this.Base_gui.GUI_properties.render_properties === 'function') {
					this.Base_gui.GUI_properties.render_properties();
				}
				cache.detailsDirty = false;
			}
			if (cache.rulerDirty || zoom_changed) {
				this.View_ruler.render_ruler();
				cache.rulerDirty = false;
			}

			if (this.render_success === false) {
				alertify.error("Rendered with errors.");
			}
		}

	}

	draw_onion_skin(ctx) {
		if (!app.GUI || !app.GUI.GUI_timeline) return;
		const fm = app.GUI.GUI_timeline.Frame_manager;
		if (!fm || !fm.onion_skin || !fm.is_timeline_active) return;

		const prevCanvas = fm.get_previous_frame_canvas();
		if (!prevCanvas) return;

		ctx.save();
		zoomView.apply();
		ctx.globalAlpha = fm.onion_skin_opacity || 0.3;
		ctx.drawImage(prevCanvas, 0, 0, config.WIDTH, config.HEIGHT);
		ctx.restore();
	}

	render_overlay() {
		this.draw_onion_skin(this.ctx);

		var render_class = config.TOOL.name;
		var render_function = "render_overlay";

		if (
			typeof this.Base_gui.GUI_tools.tools_modules[render_class].object[
				render_function
			] != "undefined"
		) {
			this.Base_gui.GUI_tools.tools_modules[render_class].object[
				render_function
			](this.ctx);
		}
	}

	/**
	 * LEGACY: use create_new_canvas();
	 */
	createNewCanvas(ctx, h, w) {
		this.create_new_canvas(ctx, w, h);
	}

	/**
	 * Creates a fresh new canvas with the same height and width as the provided one
	 * @param {canvas.context|null} ctx
	 * @param {number} [width]
	 * @param {number} [height]
	 */
	create_new_canvas(ctx, width, height) {
		const newCanvas = document.createElement("canvas");
		if(width){
			newCanvas.width = width;
		}
		else{
			newCanvas.width = ctx.canvas.width;
		}

		if(height){
			newCanvas.height = height;
		}
		else{
			newCanvas.height = ctx.canvas.height;
		}

		return newCanvas;
	}

	/**
	 * LEGACY: use render_objects()
	 */
	renderObjects(ctx, tempCanvas, layers, prepare, shouldSkip) {
		this.render_objects(ctx, tempCanvas, layers, prepare, shouldSkip);
	}

	/**
	 * Renders objects based on the provided layers
	 * @param {canvas.context} ctx - Main canvas context where it needs to be rendered
	 * @param {canvas} tempCanvas - A temporary canvas which is a copy of the original canvas, but will be used if there will be needed to isolate an effect from others
	 * @param {Object[]} layers - Array of layers
	 * @param {Function} prepare - An optional function to prepare temporary and main canvases before the render if needed
	 * @param {Function} shouldSkip - An optional boolean function for skipping those layers which are not needed to be rendered
	 */
	render_objects(ctx, tempCanvas, layers, prepare, shouldSkip) {
		const tempCtx = tempCanvas.getContext("2d");
		// Prepare the temporary canvas if needed
		prepare && prepare();
		
		for (var i = layers.length - 1; i >= 0; i--) {
			var layer = layers[i];
			const nextLayer = layers[i - 1];

			// If the previous layer has clip masking effect and the current one is not the other end of the pair,
			// then render the temporary canvas for clip masking on top of the current.
			
			// Skip the layer if not needed to be rendered
			if (shouldSkip && shouldSkip(layer)) {
				continue;
			}

			if (layer.type == null) {
				continue;
			}

			// Groups have no pixels — children paint via global order (pass-through).
			if (is_group(layer)) {
				continue;
			}

			// Honor group visibility: hiding a parent group hides contents.
			if (!is_effectively_visible(layer)) {
				continue;
			}

			// If this is an adjustment layer
			if (layer.type === 'adjustment') {
				if (
					is_layer_clipped(layer) ||
					(nextLayer && is_layer_clipped(nextLayer))
				) {
					if (nextLayer && is_layer_clipped(nextLayer)) {
						this.render_adjustment(ctx, layer);
						this.render_adjustment(tempCtx, layer);
					} else {
						this.render_adjustment(tempCtx, layer);
						ctx.restore();
						ctx.drawImage(tempCanvas, 0, 0);
						prepare && prepare();
						tempCtx.globalCompositeOperation = null;
						tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
					}
				} else {
					this.render_adjustment(ctx, layer);
				}
				continue;
			}

			// Clipping masks: tempCanvas holds the clip-base alpha. Clipped
			// layers are masked to that alpha, then composited with their real
			// blend mode (clip and blend are independent — Photoshop-style).
			if (is_layer_clipped(layer)) {
				var blend = get_render_composition(layer);
				if (!this._clip_layer_canvas) {
					this._clip_layer_canvas = document.createElement('canvas');
				}
				var layerCanvas = this._clip_layer_canvas;
				if (layerCanvas.width !== tempCanvas.width || layerCanvas.height !== tempCanvas.height) {
					layerCanvas.width = tempCanvas.width;
					layerCanvas.height = tempCanvas.height;
				}
				var layerCtx = layerCanvas.getContext('2d');
				layerCtx.setTransform(1, 0, 0, 1, 0, 0);
				layerCtx.globalAlpha = 1;
				layerCtx.globalCompositeOperation = 'source-over';
				layerCtx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
				layerCtx.globalAlpha = layer.opacity / 100;
				this.render_object(layerCtx, layer);

				// Keep only pixels that overlap the clip-base alpha.
				layerCtx.globalAlpha = 1;
				layerCtx.globalCompositeOperation = 'destination-in';
				layerCtx.drawImage(tempCanvas, 0, 0);

				// Composite masked pixels with the layer's real blend mode.
				if (this._is_custom_blend(blend)) {
					this._composite_custom_blend(ctx, layerCanvas, blend);
				} else {
					ctx.globalAlpha = 1;
					ctx.globalCompositeOperation = blend;
					ctx.drawImage(layerCanvas, 0, 0);
				}

				// End of clip group when the next (above) layer is not clipped.
				if (!nextLayer || !is_layer_clipped(nextLayer)) {
					ctx.restore();
					prepare && prepare();
					tempCtx.globalCompositeOperation = null;
					tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
				}
			} else if (nextLayer && is_layer_clipped(nextLayer)) {
				// Clip BASE — paint with its real blend; copy alpha into temp
				// (without drop-shadow) so clipped siblings can mask to it.
				var baseComp = get_render_composition(layer);
				if (this._is_custom_blend(baseComp)) {
					if (!this._custom_blend_canvas) {
						this._custom_blend_canvas = document.createElement('canvas');
					}
					var bCanvas = this._custom_blend_canvas;
					if (bCanvas.width !== ctx.canvas.width || bCanvas.height !== ctx.canvas.height) {
						bCanvas.width = ctx.canvas.width;
						bCanvas.height = ctx.canvas.height;
					}
					var bCtx = bCanvas.getContext('2d');
					bCtx.setTransform(1, 0, 0, 1, 0, 0);
					bCtx.clearRect(0, 0, bCanvas.width, bCanvas.height);
					bCtx.globalAlpha = layer.opacity / 100;
					bCtx.globalCompositeOperation = 'source-over';
					this.render_object(bCtx, layer);
					this._composite_custom_blend(ctx, bCanvas, baseComp);
				} else {
					ctx.globalAlpha = layer.opacity / 100;
					ctx.globalCompositeOperation = baseComp;
					this.render_object(ctx, layer);
				}
				tempCtx.globalAlpha = layer.opacity / 100;
				tempCtx.globalCompositeOperation = 'source-over';
				const filters = (layer.filters || []).filter((filter) => {
					return filter.name !== "shadow";
				});
				this.render_object(tempCtx, {
					...layer,
					filters,
				});
			} else {
				var comp = get_render_composition(layer);
				if (this._is_custom_blend(comp)) {
					if (!this._custom_blend_canvas) {
						this._custom_blend_canvas = document.createElement('canvas');
					}
					var bCanvas = this._custom_blend_canvas;
					if (bCanvas.width !== ctx.canvas.width || bCanvas.height !== ctx.canvas.height) {
						bCanvas.width = ctx.canvas.width;
						bCanvas.height = ctx.canvas.height;
					}
					var bCtx = bCanvas.getContext('2d');
					bCtx.setTransform(1, 0, 0, 1, 0, 0);
					bCtx.clearRect(0, 0, bCanvas.width, bCanvas.height);
					bCtx.globalAlpha = layer.opacity / 100;
					bCtx.globalCompositeOperation = 'source-over';
					this.render_object(bCtx, layer);
					this._composite_custom_blend(ctx, bCanvas, comp);
				} else {
					ctx.globalAlpha = layer.opacity / 100;
					ctx.globalCompositeOperation = comp;
					this.render_object(ctx, layer);
				}
			}
		}

	}

	render_preview(layers) {
		var w = this.Base_gui.GUI_preview.PREVIEW_SIZE.w;
		var h = this.Base_gui.GUI_preview.PREVIEW_SIZE.h;

		this.ctx_preview.save();
		this.ctx_preview.setTransform(1, 0, 0, 1, 0, 0);
		this.ctx_preview.clearRect(0, 0, w, h);

		if (!this._preview_temp_canvas) {
			this._preview_temp_canvas = document.createElement("canvas");
		}
		if (this._preview_temp_canvas.width !== w || this._preview_temp_canvas.height !== h) {
			this._preview_temp_canvas.width = w;
			this._preview_temp_canvas.height = h;
		}
		const tempCtx = this._preview_temp_canvas.getContext("2d");
		tempCtx.setTransform(1, 0, 0, 1, 0, 0);
		tempCtx.clearRect(0, 0, w, h);
		tempCtx.scale(w / config.WIDTH, h / config.HEIGHT);

		this.render_objects(this.ctx_preview, this._preview_temp_canvas, layers, () => {
			this.ctx_preview.save();
			this.ctx_preview.scale(w / config.WIDTH, h / config.HEIGHT);
		});

		this.ctx_preview.restore();
		this.Base_gui.GUI_preview.render_preview_active_zone();
	}

	/**
	 * export current layers to given canvas
	 *
	 * @param {canvas.context} ctx
	 * @param {object} object
	 * @param {boolean} is_preview
	 */

	/**
	 * Draw layer pixels/content only (no filters). Used for Fill Opacity punch-out.
	 */
	_draw_layer_content(ctx, object, is_preview) {
		const hasRotate = object.rotate != null && object.rotate !== 0;
		if (hasRotate) {
			ctx.save();
			const cx = (object.x || 0) + (object.width || 0) / 2;
			const cy = (object.y || 0) + (object.height || 0) / 2;
			ctx.translate(cx, cy);
			ctx.rotate((object.rotate * Math.PI) / 180);
			ctx.translate(-cx, -cy);
		}

		if (object.type == "image") {
			ctx.drawImage(
				object.link_canvas != null ? object.link_canvas : object.link,
				object.x || 0,
				object.y || 0,
				object.width,
				object.height
			);
		} else if (object.render_function) {
			var render_class = object.render_function[0];
			var render_function = object.render_function[1];
			if (
				this.Base_gui.GUI_tools &&
				this.Base_gui.GUI_tools.tools_modules[render_class] &&
				typeof this.Base_gui.GUI_tools.tools_modules[render_class].object[
					render_function
				] !=
				"undefined"
			) {
				this.Base_gui.GUI_tools.tools_modules[render_class].object[
					render_function
				](ctx, object, is_preview);
			}
		}

		if (hasRotate) {
			ctx.restore();
		}
	}

	/**
	 * True when layer has style FX that should remain visible at Fill Opacity < 100.
	 */
	_layer_has_style_fx(object) {
		var filters = object && object.filters;
		if (!filters || !filters.length) return false;
		var styleNames = {
			shadow: 1, 'drop-shadow': 1, outer_glow: 1, stroke: 1,
			inner_glow: 1, color_overlay: 1
		};
		for (var i = 0; i < filters.length; i++) {
			var f = filters[i];
			if (!f || f.disabled === true || f.visible === false) continue;
			if (Array.isArray(this.disabled_filter_id)) {
				if (this.disabled_filter_id.includes(f.id) || this.disabled_filter_id.includes(f.name)
					|| (f.name === 'drop-shadow' && this.disabled_filter_id.includes('shadow'))) {
					continue;
				}
			} else if (f.id == this.disabled_filter_id || f.name == this.disabled_filter_id) {
				continue;
			}
			if (styleNames[f.name]) return true;
		}
		return false;
	}

	/**
	 * After CSS drop-shadow / outer_glow were drawn with the content, punch the
	 * content footprint and redraw it at fillOpacity so FX stay full-strength
	 * (Photoshop Fill Opacity).
	 */
	_apply_fill_opacity_punch(ctx, object, fill, is_preview) {
		if (fill >= 0.999) return;
		ctx.save();
		ctx.filter = 'none';
		// Remove full-strength content; leave shadow/glow that CSS filter added outside.
		ctx.globalCompositeOperation = 'destination-out';
		ctx.globalAlpha = 1;
		this._render_object_body(ctx, object, is_preview);
		// Redraw content at fill (caller already applied layer opacity via globalAlpha).
		ctx.globalCompositeOperation = 'source-over';
		ctx.globalAlpha = fill;
		this._render_object_body(ctx, object, is_preview);
		ctx.restore();
	}

	render_object(ctx, object, is_preview) {
		if (object.visible == false || object.type == null || is_group(object)) return;

		if (object.type === 'adjustment') {
			this.render_adjustment(ctx, object);
			return;
		}

		var fillOpacity = (object.fillOpacity != null) ? Number(object.fillOpacity) : 100;
		if (!isFinite(fillOpacity)) fillOpacity = 100;
		fillOpacity = Math.max(0, Math.min(100, fillOpacity));
		var fill = fillOpacity / 100;
		var hasStyleFx = this._layer_has_style_fx(object);

		// Photoshop Fill: fade pixels only. With style FX, render offscreen so we can
		// punch content without erasing other layers, then blit under layer opacity.
		if (fill < 0.999 && hasStyleFx) {
			var layerAlpha = ctx.globalAlpha;
			var canvas = this.create_new_canvas(ctx);
			var bctx = canvas.getContext("2d");
			var t = null;
			if (typeof ctx.getTransform == "function")
				t = ctx.getTransform();
			bctx.setTransform(
				t ? t.a : 1,
				t ? t.b : 0,
				t ? t.c : 0,
				t ? t.d : 1,
				t ? t.e : 0,
				t ? t.f : 0
			);
			bctx.globalAlpha = 1;
			bctx.globalCompositeOperation = 'source-over';

			this.pre_render_object(bctx, object);
			this._render_object_body(bctx, object, is_preview);
			this._apply_fill_opacity_punch(bctx, object, fill, is_preview);
			this.after_render_object(bctx, object);

			ctx.save();
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.filter = 'none';
			ctx.globalAlpha = layerAlpha;
			ctx.drawImage(canvas, 0, 0);
			ctx.restore();
			canvas.width = 1;
			canvas.height = 1;
			return;
		}

		if (fill < 0.999 && !hasStyleFx) {
			ctx.save();
			ctx.globalAlpha = ctx.globalAlpha * fill;
		}

		this.pre_render_object(ctx, object);
		this._render_object_body(ctx, object, is_preview);
		this.after_render_object(ctx, object);

		if (fill < 0.999 && !hasStyleFx) {
			ctx.restore();
		}
	}

	/**
	 * Shared content draw used by render_object (mask + image / render_function).
	 */
	_render_object_body(ctx, object, is_preview) {
		var masked = object.mask != null && object.mask.enabled !== false;

		if (masked === true) {
			// Render clean content into an offscreen buffer, multiply alpha by the mask,
			// then composite the result onto ctx with its active filters/opacity/composition,
			// so style FX (drop shadow, outer glow, etc.) apply to the masked shape rather
			// than having the mask cut off the FX itself.
			if (!this.Mask) {
				this.Mask = new Mask_class();
			}
			var canvas = this.create_new_canvas(ctx);
			var bctx = canvas.getContext("2d");

			var t = null;
			if (typeof ctx.getTransform == "function")
				t = ctx.getTransform();
			bctx.setTransform(
				t ? t.a : 1,
				t ? t.b : 0,
				t ? t.c : 0,
				t ? t.d : 1,
				t ? t.e : 0,
				t ? t.f : 0
			);
			bctx.filter = "none";

			// Draw clean content into the buffer
			this._draw_layer_content(bctx, object, is_preview);

			// Apply the mask (alpha multiply) to produce the masked layer content
			this.Mask.multiply_alpha_by_mask_world(bctx, object);

			// Composite the masked buffer onto ctx, preserving ctx.filter so that
			// drop-shadow / outer-glow / blur generate from the masked shape and
			// radiate outwards without being clipped by the mask.
			ctx.save();
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.drawImage(canvas, 0, 0);
			ctx.restore();
			canvas.width = 1;
			canvas.height = 1;
		} else {
			this._draw_layer_content(ctx, object, is_preview);
		}
	}

	/**
	 * Gets called before render_object starts it's job
	 * @param {canvas.context} ctx
	 * @param {object} object
	 */
	pre_render_object(ctx, object) {
		//apply pre-filters
		if (!object.filters) return;
		for (let k = 0; k < object.filters.length; k++) {
			let filter = object.filters[k];
			if (!filter || filter.disabled === true || filter.visible === false) continue;
			if (Array.isArray(this.disabled_filter_id)) {
				if (this.disabled_filter_id.includes(filter.id) || this.disabled_filter_id.includes(filter.name) || (filter.name === 'drop-shadow' && this.disabled_filter_id.includes('shadow'))) {
					continue;
				}
			} else if (filter.id == this.disabled_filter_id || filter.name == this.disabled_filter_id) {
				continue;
			}

			let filter_name = filter.name === 'drop-shadow' ? 'shadow' : filter.name;

			//find filter
			let found = false;
			for (let m in this.Base_gui.modules) {
				if (m.indexOf("effects") == -1 || m.indexOf("abstract") > -1) continue;

				let filter_class = this.Base_gui.modules[m];
				let module_name = m.split("/").pop();
				if (module_name == filter_name) {
					//found it
					found = true;
					filter_class.render_pre(ctx, filter, object);
				}
			}
			if (found == false) {
				this.render_success = false;
				console.log("Error: can not find filter: " + filter_name);
			}
		}
	}

	/**
	 * Gets called after when render_object finishes it's job
	 * @param {canvas.context} ctx
	 * @param {object} object
	 */
	after_render_object(ctx, object) {
		//apply post-filters
		if (!object.filters) return;
		for (let k = 0; k < object.filters.length; k++) {
			let filter = object.filters[k];
			if (!filter || filter.disabled === true || filter.visible === false) continue;
			if (Array.isArray(this.disabled_filter_id)) {
				if (this.disabled_filter_id.includes(filter.id) || this.disabled_filter_id.includes(filter.name) || (filter.name === 'drop-shadow' && this.disabled_filter_id.includes('shadow'))) {
					continue;
				}
			} else if (filter.id == this.disabled_filter_id || filter.name == this.disabled_filter_id) {
				continue;
			}
			let filter_name = filter.name === 'drop-shadow' ? 'shadow' : filter.name;

			//find filter
			let found = false;
			for (let m in this.Base_gui.modules) {
				if (m.indexOf("effects") == -1 || m.indexOf("abstract") > -1) continue;

				let filter_class = this.Base_gui.modules[m];
				let module_name = m.split("/").pop();
				if (module_name == filter_name) {
					//found it
					found = true;
					filter_class.render_post(ctx, filter, object);
				}
			}
			if (found == false) {
				this.render_success = false;
				console.log("Error: can not find filter: " + filter_name);
			}
		}
	}

	/**
	 * Renders an adjustment layer onto targetCtx
	 * @param {CanvasRenderingContext2D} targetCtx
	 * @param {object} layer
	 */
	render_adjustment(targetCtx, layer) {
		if (!layer || layer.visible === false) return;

		const type = layer.adjustment_type ? layer.adjustment_type.toLowerCase().replace(/_/g, '-') : null;
		const filterString = this.get_adjustment_filter_string(layer);
		if (type !== 'threshold' && type !== 'exposure' && (!filterString || filterString === 'none')) return;

		const W = targetCtx.canvas.width;
		const H = targetCtx.canvas.height;
		if (W === 0 || H === 0) return;

		if (!this.adj_scratch_canvas) {
			this.adj_scratch_canvas = document.createElement('canvas');
		}
		if (this.adj_scratch_canvas.width !== W || this.adj_scratch_canvas.height !== H) {
			this.adj_scratch_canvas.width = W;
			this.adj_scratch_canvas.height = H;
		}

		const scratchCtx = this.adj_scratch_canvas.getContext('2d');
		scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
		scratchCtx.clearRect(0, 0, W, H);
		scratchCtx.drawImage(targetCtx.canvas, 0, 0);

		const hasMask = layer.mask != null && layer.mask.enabled !== false;
		const opacity = (layer.opacity ?? 100) / 100;
		const comp = get_render_composition(layer);

		if (hasMask) {
			if (!this.Mask) {
				this.Mask = new Mask_class();
			}
			if (!this.adj_filtered_canvas) {
				this.adj_filtered_canvas = document.createElement('canvas');
			}
			if (this.adj_filtered_canvas.width !== W || this.adj_filtered_canvas.height !== H) {
				this.adj_filtered_canvas.width = W;
				this.adj_filtered_canvas.height = H;
			}

			const fCtx = this.adj_filtered_canvas.getContext('2d');
			fCtx.setTransform(1, 0, 0, 1, 0, 0);
			fCtx.clearRect(0, 0, W, H);
			this.apply_adjustment_effect(fCtx, this.adj_scratch_canvas, layer, W, H);

			this.Mask.multiply_alpha_by_mask_world(fCtx, layer);

			targetCtx.save();
			targetCtx.setTransform(1, 0, 0, 1, 0, 0);
			targetCtx.globalAlpha = opacity;
			targetCtx.globalCompositeOperation = comp;
			targetCtx.drawImage(this.adj_filtered_canvas, 0, 0);
			targetCtx.restore();
		} else {
			if (opacity >= 0.999 && (comp === 'source-over' || comp === 'source-atop')) {
				targetCtx.save();
				targetCtx.setTransform(1, 0, 0, 1, 0, 0);
				targetCtx.clearRect(0, 0, W, H);
				this.apply_adjustment_effect(targetCtx, this.adj_scratch_canvas, layer, W, H);
				targetCtx.restore();
			} else {
				if (!this.adj_filtered_canvas) {
					this.adj_filtered_canvas = document.createElement('canvas');
				}
				if (this.adj_filtered_canvas.width !== W || this.adj_filtered_canvas.height !== H) {
					this.adj_filtered_canvas.width = W;
					this.adj_filtered_canvas.height = H;
				}

				const fCtx = this.adj_filtered_canvas.getContext('2d');
				fCtx.setTransform(1, 0, 0, 1, 0, 0);
				fCtx.clearRect(0, 0, W, H);
				this.apply_adjustment_effect(fCtx, this.adj_scratch_canvas, layer, W, H);

				targetCtx.save();
				targetCtx.setTransform(1, 0, 0, 1, 0, 0);
				targetCtx.globalAlpha = opacity;
				targetCtx.globalCompositeOperation = comp;
				targetCtx.drawImage(this.adj_filtered_canvas, 0, 0);
				targetCtx.restore();
			}
		}
	}

	/**
	 * Applies the adjustment effect (CSS filter or pixel algorithm) from srcCanvas onto destCtx
	 */
	apply_adjustment_effect(destCtx, srcCanvas, layer, W, H) {
		const type = layer.adjustment_type ? layer.adjustment_type.toLowerCase().replace(/_/g, '-') : null;

		if (type === 'threshold') {
			destCtx.drawImage(srcCanvas, 0, 0);
			const imgData = destCtx.getImageData(0, 0, W, H);
			const buf32 = new Uint32Array(imgData.data.buffer);
			const threshold = (layer.params && layer.params.value !== undefined) ? layer.params.value : 128;

			for (let i = 0; i < buf32.length; i++) {
				const pixel = buf32[i];
				const a = (pixel >> 24) & 0xff;
				if (a === 0) continue;
				const r = pixel & 0xff;
				const g = (pixel >> 8) & 0xff;
				const b = (pixel >> 16) & 0xff;
				const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
				const v = lum >= threshold ? 255 : 0;
				buf32[i] = (a << 24) | (v << 16) | (v << 8) | v;
			}
			destCtx.putImageData(imgData, 0, 0);
		} else if (type === 'exposure') {
			// Photoshop-like Exposure: color * 2^exposure + offset, then pow(c, 1/gamma)
			destCtx.drawImage(srcCanvas, 0, 0);
			const imgData = destCtx.getImageData(0, 0, W, H);
			const data = imgData.data;
			const p = layer.params || {};
			const exposure = (p.exposure !== undefined) ? Number(p.exposure) : 0;
			const offset = (p.offset !== undefined) ? Number(p.offset) : 0;
			let gamma = (p.gamma !== undefined) ? Number(p.gamma) : 1;
			if (!isFinite(gamma) || gamma <= 0) gamma = 1;
			const invGamma = 1 / gamma;
			const exposureMul = Math.pow(2, exposure);

			const applyChannel = (c) => {
				let v = (c / 255) * exposureMul + offset;
				if (v <= 0) return 0;
				v = Math.pow(v, invGamma);
				if (v >= 1) return 255;
				return Math.round(v * 255);
			};

			for (let i = 0; i < data.length; i += 4) {
				if (data[i + 3] === 0) continue;
				data[i] = applyChannel(data[i]);
				data[i + 1] = applyChannel(data[i + 1]);
				data[i + 2] = applyChannel(data[i + 2]);
			}
			destCtx.putImageData(imgData, 0, 0);
		} else if (type === 'hue-saturation' || type === 'hue/saturation' || type === 'huesaturation') {
			const p = layer.params || {};
			const hue = (p.hue !== undefined) ? Number(p.hue) : 0;
			const sat = (p.saturation !== undefined) ? Number(p.saturation) : 0;
			const light = (p.lightness !== undefined) ? Number(p.lightness) : 0;

			let parts = [];
			if (hue !== 0) parts.push(`hue-rotate(${hue}deg)`);
			if (sat !== 0) parts.push(`saturate(${(sat / 100) + 1})`);
			if (parts.length > 0) {
				destCtx.filter = parts.join(' ');
			}
			destCtx.drawImage(srcCanvas, 0, 0);
			destCtx.filter = 'none';

			if (light !== 0) {
				const imgData = destCtx.getImageData(0, 0, W, H);
				const data = imgData.data;
				const l = light / 100;
				if (l >= 0) {
					for (let i = 0; i < data.length; i += 4) {
						if (data[i + 3] === 0) continue;
						data[i] = Math.round(data[i] + (255 - data[i]) * l);
						data[i + 1] = Math.round(data[i + 1] + (255 - data[i + 1]) * l);
						data[i + 2] = Math.round(data[i + 2] + (255 - data[i + 2]) * l);
					}
				} else {
					const factor = 1 + l;
					for (let i = 0; i < data.length; i += 4) {
						if (data[i + 3] === 0) continue;
						data[i] = Math.round(data[i] * factor);
						data[i + 1] = Math.round(data[i + 1] * factor);
						data[i + 2] = Math.round(data[i + 2] * factor);
					}
				}
				destCtx.putImageData(imgData, 0, 0);
			}
		} else {
			const filterString = this.get_adjustment_filter_string(layer);
			destCtx.filter = filterString;
			destCtx.drawImage(srcCanvas, 0, 0);
			destCtx.filter = 'none';
		}
	}

	get_adjustment_filter_string(layer) {
		if (!layer) return 'none';

		let type = layer.adjustment_type;
		let params = layer.params || {};

		if (!type && layer.filters && layer.filters.length > 0) {
			let filtersArr = [];
			for (let f of layer.filters) {
				if (f && !f.disabled) {
					let str = this.convert_filter_to_css(f.name, f.params || {});
					if (str) filtersArr.push(str);
				}
			}
			return filtersArr.length > 0 ? filtersArr.join(' ') : 'none';
		}

		return this.convert_filter_to_css(type, params) || 'none';
	}

	convert_filter_to_css(type, params) {
		if (!type) return null;
		type = type.toLowerCase().replace(/_/g, '-');
		let value = params ? params.value : undefined;

		switch (type) {
			case 'brightness': {
				let v = (value !== undefined) ? value : 0;
				let sysVal = v / 100 + 1;
				let res = `brightness(${sysVal})`;
				if (params && params.contrast) {
					let cVal = params.contrast / 100 + 1;
					res += ` contrast(${cVal})`;
				}
				return res;
			}
			case 'contrast': {
				let v = (value !== undefined) ? value : 0;
				let sysVal = v / 100 + 1;
				return `contrast(${sysVal})`;
			}
			case 'brightness/contrast':
			case 'brightness-contrast': {
				let b = (params && params.brightness !== undefined) ? params.brightness : ((params && params.value !== undefined) ? params.value : 0);
				let c = (params && params.contrast !== undefined) ? params.contrast : 0;
				let bVal = b / 100 + 1;
				let cVal = c / 100 + 1;
				let res = `brightness(${bVal})`;
				if (c !== 0) res += ` contrast(${cVal})`;
				return res;
			}
			case 'hue-saturation':
			case 'hue/saturation':
			case 'huesaturation': {
				let hue = (params && params.hue !== undefined) ? params.hue : ((value !== undefined) ? value : 0);
				let sat = (params && params.saturation !== undefined) ? params.saturation : 0;
				let parts = [`hue-rotate(${hue}deg)`];
				parts.push(`saturate(${(sat / 100) + 1})`);
				return parts.join(' ');
			}
			case 'hue-rotate':
			case 'hue_rotate': {
				let v = (value !== undefined) ? value : 0;
				return `hue-rotate(${v}deg)`;
			}
			case 'saturate': {
				let v = (value !== undefined) ? value : 0;
				let sysVal = v / 100 + 1;
				return `saturate(${sysVal})`;
			}
			case 'grayscale': {
				let v = (value !== undefined) ? value : 100;
				return `grayscale(${v / 100})`;
			}
			case 'sepia': {
				let v = (value !== undefined) ? value : 100;
				return `sepia(${v / 100})`;
			}
			case 'invert': {
				let v = (value !== undefined) ? value : 100;
				return `invert(${v / 100})`;
			}
			case 'blur': {
				let v = (value !== undefined) ? value : 5;
				return `blur(${v}px)`;
			}
			default:
				return null;
		}
	}

	/**
	 * creates new layer
	 *
	 * @param {array} settings
	 * @param {boolean} can_automate
	 */
	async insert(settings, can_automate = true) {
		return app.State.do_action(
			new app.Actions.Insert_layer_action(settings, can_automate)
		);
	}

	/**
	 * autoresize layer, based on dimensions, up - always, if 1 layer - down.
	 *
	 * @param {int} width
	 * @param {int} height
	 * @param {int} layer_id
	 * @param {boolean} can_automate
	 */
	async autoresize(width, height, layer_id, can_automate = true) {
		return app.State.do_action(
			new app.Actions.Autoresize_canvas_action(
				width,
				height,
				layer_id,
				can_automate
			)
		);
	}

	/**
	 * returns layer
	 *
	 * @param {int} id
	 * @param {boolean} [quiet=false]
	 * @returns {object}
	 */
	get_layer(id, quiet = false) {
		if (id == undefined) {
			id = config.layer ? config.layer.id : null;
		}
		if (id == null) {
			return null;
		}
		for (var i in config.layers) {
			if (config.layers[i].id == id) {
				return config.layers[i];
			}
		}
		if (!quiet) {
			console.warn("can not find layer with id:" + id);
		}
		return null;
	}

	/**
	 * Safe layer lookup that never triggers an alertify error.
	 *
	 * @param {int} id
	 * @returns {object|null}
	 */
	find_layer(id) {
		return this.get_layer(id, true);
	}

	/**
	 * Checks whether a layer exists without side effects.
	 *
	 * @param {int} id
	 * @returns {boolean}
	 */
	has_layer(id) {
		return this.find_layer(id) !== null;
	}

	/**
	 * removes layer
	 *
	 * @param {int} id
	 * @param {boolean} force - Force to delete first layer?
	 */
	async delete(id, force) {
		return app.State.do_action(new app.Actions.Delete_layer_action(id, force));
	}

	/*
	 * removes all layers
	 */
	async reset_layers(auto_insert) {
		return app.State.do_action(
			new app.Actions.Reset_layers_action(auto_insert)
		);
	}

	/**
	 * toggle layer visibility
	 *
	 * @param {int} id
	 */
	async toggle_visibility(id) {
		return app.State.do_action(
			new app.Actions.Toggle_layer_visibility_action(id)
		);
	}

	/*
	 * renew layers HTML
	 */
	refresh_gui() {
		this.Base_gui.GUI_layers.render_layers();
	}

	/**
	 * marks layer as selected, active
	 *
	 * @param {int} id
	 */
	async select(id) {
		return app.State.do_action(new app.Actions.Select_layer_action(id));
	}

	/**
	 * change layer opacity
	 *
	 * @param {int} id
	 * @param {int} value 0-100
	 */
	async set_opacity(id, value) {
		value = parseInt(value);
		if (value < 0 || value > 100) {
			//reset
			value = 100;
		}
		return app.State.do_action(
			new app.Actions.Update_layer_action(id, {
				opacity: value,
			})
		);
	}

	/**
	 * clear layer data
	 *
	 * @param {int} id
	 */
	async layer_clear(id) {
		return app.State.do_action(new app.Actions.Clear_layer_action(id));
	}

	/**
	 * move layer up or down
	 *
	 * @param {int} id
	 * @param {int} direction
	 */
	async move(id, direction) {
		return app.State.do_action(
			new app.Actions.Reorder_layer_action(id, direction)
		);
	}

	/**
	 * Creates a selection from the non-transparent pixels on the given layer (or group).
	 *
	 * @param {object} layer
	 * @param {string} mode 'replace' | 'add' | 'subtract' | 'intersect'
	 */
	select_layer_pixels(layer, mode = 'replace') {
		if (!layer) return;
		if (layer.type === 'adjustment') {
			if (layer.mask) {
				return this.select_mask_pixels(layer, mode);
			}
			alertify.error('Adjustment layers do not contain pixels.');
			return;
		}

		var W = Math.max(1, config.WIDTH || 800);
		var H = Math.max(1, config.HEIGHT || 600);
		var scratch = document.createElement('canvas');
		scratch.width = W;
		scratch.height = H;
		var sctx = scratch.getContext('2d', { willReadFrequently: true });

		if (is_group(layer)) {
			var descIds = get_descendant_ids(layer.id);
			var layersToDraw = [];
			for (var i = 0; i < descIds.length; i++) {
				var l = this.get_layer(descIds[i], true);
				if (l && !is_group(l) && l.type !== 'adjustment') {
					layersToDraw.push(l);
				}
			}
			layersToDraw.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
			for (var j = 0; j < layersToDraw.length; j++) {
				this._render_object_body(sctx, layersToDraw[j], false);
			}
		} else {
			this._render_object_body(sctx, layer, false);
		}

		var imgData = sctx.getImageData(0, 0, W, H);
		var d = imgData.data;
		var hasAny = false;
		for (var k = 0; k < d.length; k += 4) {
			var a = d[k + 3];
			if (a > 0) hasAny = true;
			d[k] = a;
			d[k + 1] = a;
			d[k + 2] = a;
			d[k + 3] = a;
		}
		sctx.putImageData(imgData, 0, 0);

		if (!hasAny) {
			alertify.warning('No pixels on selected layer.');
			return;
		}

		this._apply_selection_mask(scratch, mode);
	}

	/**
	 * Creates a selection from the visible (revealed) pixels in the layer mask.
	 *
	 * @param {object} layer
	 * @param {string} mode 'replace' | 'add' | 'subtract' | 'intersect'
	 */
	select_mask_pixels(layer, mode = 'replace') {
		if (!layer || !layer.mask) {
			alertify.error('No layer mask on this layer.');
			return;
		}

		if (!this.Mask) {
			this.Mask = new Mask_class();
		}

		var mask = layer.mask;
		var alpha = this.Mask.get_mask_alpha_canvas(layer);
		if (alpha == null) {
			alertify.error('Unable to read layer mask.');
			return;
		}

		var source = this.Mask.get_mask_source(layer);
		var sw = source ? source.width : alpha.width;
		var sh = source ? source.height : alpha.height;

		var lx = (layer.x != null) ? layer.x : 0;
		var ly = (layer.y != null) ? layer.y : 0;
		var lw = (layer.width != null && layer.width > 0) ? layer.width : sw;
		var lh = (layer.height != null && layer.height > 0) ? layer.height : sh;
		var rotate = layer.rotate || 0;
		var rad = rotate * Math.PI / 180;
		var mx = (mask.x != null) ? mask.x : 0;
		var my = (mask.y != null) ? mask.y : 0;
		var mw = (mask.width != null && mask.width > 0) ? mask.width : (config.WIDTH || sw);
		var mh = (mask.height != null && mask.height > 0) ? mask.height : (config.HEIGHT || sh);

		var W = Math.max(1, config.WIDTH || 800);
		var H = Math.max(1, config.HEIGHT || 600);
		var scratch = document.createElement('canvas');
		scratch.width = W;
		scratch.height = H;
		var sctx = scratch.getContext('2d', { willReadFrequently: true });
		sctx.imageSmoothingEnabled = (mw !== sw || mh !== sh || rad !== 0);

		if (rad !== 0 && mask.linked !== false) {
			sctx.translate(lx + lw / 2, ly + lh / 2);
			sctx.rotate(rad);
			sctx.translate(-lw / 2, -lh / 2);
			sctx.drawImage(alpha, 0, 0, sw, sh, mx - lx, my - ly, mw, mh);
		}
		else {
			sctx.drawImage(alpha, 0, 0, sw, sh, mx, my, mw, mh);
		}

		var imgData = sctx.getImageData(0, 0, W, H);
		var d = imgData.data;
		var hasAny = false;
		for (var k = 0; k < d.length; k += 4) {
			var a = d[k + 3];
			if (a > 0) hasAny = true;
			d[k] = a;
			d[k + 1] = a;
			d[k + 2] = a;
			d[k + 3] = a;
		}
		sctx.putImageData(imgData, 0, 0);

		if (!hasAny) {
			alertify.warning('No visible mask pixels to select.');
			return;
		}

		this._apply_selection_mask(scratch, mode);
	}

	_apply_selection_mask(newMaskCanvas, mode = 'replace') {
		var baseSel = (app.Layers && app.Layers.Base_selection) ? app.Layers.Base_selection : this.Base_selection;
		var oldMask = (baseSel && baseSel.has_selection) ? baseSel.clone_mask_canvas() : null;
		var W = Math.max(1, config.WIDTH || 800);
		var H = Math.max(1, config.HEIGHT || 600);

		var finalMask = newMaskCanvas;

		if (mode !== 'replace' && oldMask) {
			var combined = document.createElement('canvas');
			combined.width = W;
			combined.height = H;
			var cctx = combined.getContext('2d', { willReadFrequently: true });

			if (mode === 'add') {
				cctx.drawImage(oldMask, 0, 0);
				cctx.globalCompositeOperation = 'source-over';
				cctx.drawImage(newMaskCanvas, 0, 0);
			} else if (mode === 'subtract') {
				cctx.drawImage(oldMask, 0, 0);
				cctx.globalCompositeOperation = 'destination-out';
				cctx.drawImage(newMaskCanvas, 0, 0);
			} else if (mode === 'intersect') {
				cctx.drawImage(oldMask, 0, 0);
				cctx.globalCompositeOperation = 'destination-in';
				cctx.drawImage(newMaskCanvas, 0, 0);
			}

			// Ensure RGB channels match alpha
			var cimg = cctx.getImageData(0, 0, W, H);
			var cd = cimg.data;
			for (var i = 0; i < cd.length; i += 4) {
				var ca = cd[i + 3];
				cd[i] = ca;
				cd[i + 1] = ca;
				cd[i + 2] = ca;
				cd[i + 3] = ca;
			}
			cctx.putImageData(cimg, 0, 0);
			finalMask = combined;
		}

		app.State.do_action(
			new app.Actions.Set_selection_action(finalMask, oldMask)
		);

		if (baseSel) {
			if (baseSel.is_marching_ants_active()) {
				baseSel.start_marching_ants();
			}
			baseSel.draw_selection();
		}
	}

	/**
	 * clone and sort.
	 */
	get_sorted_layers() {
		return config.layers.concat().sort(
			//sort function
			(a, b) => b.order - a.order
		);
	}

	/**
	 * checks if layer empty
	 *
	 * @param {int} id
	 * @returns {Boolean}
	 */
	is_layer_empty(id) {
		var link = this.get_layer(id, true);
		if (!link) return true;

		if (
			(link.width == 0 || link.width === null) &&
			(link.height == 0 || link.height === null) &&
			link.data == null
		) {
			return true;
		}

		return false;
	}

	/**
	 * find next layer
	 *
	 * @param {int} id layer id
	 * @returns {layer|null}
	 */
	find_next(id) {
		id = parseInt(id);
		var link = this.get_layer(id, true);
		if (!link) return null;
		var layers_sorted = this.get_sorted_layers();

		var last = null;
		for (var i = layers_sorted.length - 1; i >= 0; i--) {
			var value = layers_sorted[i];

			if (last != null && last.id == link.id) {
				return value;
			}
			last = value;
		}

		return null;
	}

	/**
	 * find previous layer
	 *
	 * @param {int} id layer id
	 * @returns {layer|null}
	 */
	find_previous(id) {
		id = parseInt(id);
		var link = this.get_layer(id, true);
		if (!link) return null;
		var layers_sorted = this.get_sorted_layers();

		var last = null;
		for (var i in layers_sorted) {
			var value = layers_sorted[i];

			if (last != null && last.id == link.id) {
				return value;
			}
			last = value;
		}

		return null;
	}

	/**
	 * returns global position, for example if canvas is zoomed, it will convert relative mouse position to absolute
	 * at 100% zoom.
	 *
	 * @param {int} x
	 * @param {int} y
	 * @returns {object} keys: x, y
	 */
	get_world_coords(x, y) {
		return zoomView.toWorld(x, y);
	}

	/**
	 * register new live filter
	 *
	 * @param {int} layer_id
	 * @param {string} name
	 * @param {object} params
	 */
	add_filter(layer_id, name, params) {
		return app.State.do_action(
			new app.Actions.Add_layer_filter_action(layer_id, name, params)
		);
	}

	/**
	 * delete live filter
	 *
	 * @param {int} layer_id
	 * @param {string} filter_id
	 */
	delete_filter(layer_id, filter_id) {
		return app.State.do_action(
			new app.Actions.Delete_layer_filter_action(layer_id, filter_id)
		);
	}

	/**
	 * exports all layers to canvas for saving
	 *
	 * @param {canvas.context} ctx
	 * @param {int} layer_id Optional
	 * @param {boolean} is_preview Optional
	 */
	convert_layers_to_canvas(ctx, layer_id = null, is_preview = true) {
		const newCanvas = this.create_new_canvas(ctx);
		const layers_sorted = this.get_sorted_layers();
		this.render_objects(ctx, newCanvas, layers_sorted, ()=>{
			ctx.save();
		}, (value) => {
			if (value.visible == false || value.type == null) {
				return true;
			}
			if (layer_id != null && value.id != layer_id) {
				return true;
			}
		});
	}
	/**
	 * exports (active) layer to canvas for saving
	 *
	 * @param {int} layer_id or current layer by default
	 * @param {boolean} actual_area used for resized image. Default is false.
	 * @param {boolean} can_trim default is true
	 * @returns {canvas}
	 */
	convert_layer_to_canvas(layer_id, actual_area = false, can_trim) {
		if (actual_area == null) actual_area = false;
		if (layer_id == null) layer_id = config.layer ? config.layer.id : null;
		var link = this.get_layer(layer_id, true);
		if (!link || is_group(link) || link.type == null) {
			var emptyCanvas = document.createElement("canvas");
			emptyCanvas.width = 1;
			emptyCanvas.height = 1;
			emptyCanvas.dataset.x = "0";
			emptyCanvas.dataset.y = "0";
			return emptyCanvas;
		}
		var offset_x = 0;
		var offset_y = 0;

		//create tmp canvas
		var canvas = document.createElement("canvas");
		if (actual_area === true && link.type == "image") {
			canvas.width = link.width_original;
			canvas.height = link.height_original;
			can_trim = false;
		} else {
			canvas.width = Math.max(link.width || 0, config.WIDTH || 1);
			canvas.height = Math.max(link.height || 0, config.HEIGHT || 1);
		}

		//add data
		if (actual_area === true && link.type == "image") {
			canvas.getContext("2d").drawImage(link.link, 0, 0);
		} else {
			this.render_object(canvas.getContext("2d"), link);
		}

		//trim
		if ((can_trim == true || can_trim == undefined) && link.type != null) {
			var trim_info = this.Image_trim.get_trim_info(layer_id);
			if (
				trim_info.left > 0 ||
				trim_info.top > 0 ||
				trim_info.right > 0 ||
				trim_info.bottom > 0
			) {
				offset_x = trim_info.left;
				offset_y = trim_info.top;

				var w = canvas.width - trim_info.left - trim_info.right;
				var h = canvas.height - trim_info.top - trim_info.bottom;
				if (w > 1 && h > 1) {
					this.Helper.change_canvas_size(canvas, w, h, offset_x, offset_y);
				}
			}
		}

		canvas.dataset.x = offset_x;
		canvas.dataset.y = offset_y;

		return canvas;
	}

	/**
	 * updates layer image data
	 *
	 * @param {canvas} canvas
	 * @param {int} layer_id (optional)
	 */
	update_layer_image(canvas, layer_id) {
		return app.State.do_action(
			new app.Actions.Update_layer_image_action(canvas, layer_id)
		);
	}

	/**
	 * returns canvas dimensions.
	 *
	 * @returns {object}
	 */
	get_dimensions() {
		return {
			width: config.WIDTH,
			height: config.HEIGHT,
		};
	}

	/**
	 * returns all layers
	 *
	 * @returns {array}
	 */
	get_layers() {
		return config.layers;
	}

	/**
	 * disabled filter by id
	 *
	 * @param filter_id
	 */
	disable_filter(filter_id) {
		this.disabled_filter_id = filter_id;
	}

	/**
	 * finds layer filter by filter ID
	 *
	 * @param filter_id
	 * @param filter_name
	 * @param layer_id
	 * @returns {object}
	 */
	find_filter_by_id(filter_id, filter_name, layer_id) {
		if (typeof layer_id == "undefined") {
			var layer = config.layer;
		} else {
			var layer = this.get_layer(layer_id, true);
		}

		var filter = {};
		if (!layer || !layer.filters) {
			return filter;
		}
		for (var i in layer.filters) {
			if (
				layer.filters[i].name == filter_name &&
				layer.filters[i].id == filter_id
			) {
				return layer.filters[i].params;
			}
		}

		return filter;
	}

	// ---- Renderer management ----

	/**
	 * Switch the active renderer.
	 *
	 * @param {'canvas2d'|'webgl'} mode
	 */
	switchRenderer(mode) {
		var renderer = switch_renderer(mode, config.WIDTH, config.HEIGHT);
		this.active_renderer = renderer;

		// Re-initialize zoom library with the new renderer's context
		if (renderer.type === 'canvas2d') {
			zoomView.setContext(this.ctx);
		}
		// For WebGL, zoom is handled in the shader; the main canvas context stays the same

		config.need_render = true;
	}

	/**
	 * Returns the type of the currently active renderer.
	 * @returns {'canvas2d'|'webgl'}
	 */
	get_renderer_type() {
		var renderer = get_renderer();
		return renderer ? renderer.type : 'canvas2d';
	}

	/**
	 * Notify the renderer that a layer's pixel data has changed.
	 * The renderer should invalidate any cached GPU texture for that layer.
	 *
	 * @param {number} layerId
	 */
	notify_layer_data_changed(layerId) {
		var layer = layerId != null ? this.get_layer(layerId, true) : config.layer;
		if (layer) {
			delete layer._content_bounds_local;
		}
		this.invalidate({ document: true, preview: true, details: true });
		var renderer = get_renderer();
		if (renderer && renderer.on_layer_data_changed) {
			renderer.on_layer_data_changed(layerId);
		}
	}

	/**
	 * Notify that all layers have changed (e.g. when switching timeline frames or loading documents).
	 * Invalidates all 2D composite caches and WebGL texture caches.
	 */
	notify_all_layers_changed() {
		if (config.layers) {
			for (const l of config.layers) {
				delete l._content_bounds_local;
			}
		}
		if (this.Composite_cache) {
			this.Composite_cache.pendingInteractiveLayerId = null;
			this.Composite_cache.invalidate_document();
			this.Composite_cache.previewDirty = true;
			this.Composite_cache.detailsDirty = true;
			this.Composite_cache.rulerDirty = true;
		}
		var renderer = get_renderer();
		if (renderer) {
			if (typeof renderer.clear_texture_cache === 'function') {
				renderer.clear_texture_cache();
			}
			if (typeof renderer.invalidate_composite_cache === 'function') {
				renderer.invalidate_composite_cache();
			}
		}
		this.invalidate({ document: true, full: true, preview: true, details: true, ruler: true });
	}

	/**
	 * Notify the renderer that a layer's mask has changed.
	 *
	 * @param {number} layerId
	 */
	notify_mask_changed(layerId) {
		var layer = layerId != null ? this.get_layer(layerId, true) : config.layer;
		if (layer) {
			delete layer._content_bounds_local;
		}
		if (layer && layer.mask) {
			delete layer.mask._alpha_canvas;
			delete layer.mask._alpha_source;
		}
		if (this.Composite_cache) {
			this.Composite_cache.invalidate_document();
		}
		var renderer = get_renderer();
		if (renderer && renderer.on_mask_changed) {
			renderer.on_mask_changed(layerId);
		}
		config.need_render = true;
	}

	/**
	 * Returns true if blend mode requires software pixel compositing in Canvas2D.
	 */
	_is_custom_blend(mode) {
		return mode === 'linear-burn' ||
			mode === 'darker-color' ||
			mode === 'lighter-color' ||
			mode === 'linear-light' ||
			mode === 'vivid-light' ||
			mode === 'pin-light' ||
			mode === 'hard-mix' ||
			mode === 'subtract' ||
			mode === 'divide' ||
			mode === 'luminosity';
	}

	/**
	 * Composites srcCanvas onto destCtx with exact Photoshop math and Porter-Duff alpha.
	 */
	_composite_custom_blend(destCtx, srcCanvas, blendMode) {
		const W = destCtx.canvas.width;
		const H = destCtx.canvas.height;
		if (W === 0 || H === 0) return;

		const imgDest = destCtx.getImageData(0, 0, W, H);
		const d = imgDest.data;
		const s = srcCanvas.getContext('2d').getImageData(0, 0, W, H).data;

		const lum601 = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
		const clipColor = (r, g, b) => {
			let l = lum601(r, g, b);
			let n = Math.min(r, Math.min(g, b));
			let mx = Math.max(r, Math.max(g, b));
			if (n < 0) {
				const denom = Math.max(l - n, 0.00001);
				r = l + (((r - l) * l) / denom);
				g = l + (((g - l) * l) / denom);
				b = l + (((b - l) * l) / denom);
			}
			mx = Math.max(r, Math.max(g, b));
			if (mx > 1.0) {
				const denom = Math.max(mx - l, 0.00001);
				r = l + (((r - l) * (1.0 - l)) / denom);
				g = l + (((g - l) * (1.0 - l)) / denom);
				b = l + (((b - l) * (1.0 - l)) / denom);
			}
			return [Math.max(0, Math.min(1.0, r)), Math.max(0, Math.min(1.0, g)), Math.max(0, Math.min(1.0, b))];
		};

		for (let i = 0; i < d.length; i += 4) {
			const as = s[i + 3] / 255;
			if (as <= 0) continue;

			const ab = d[i + 3] / 255;
			const csr = s[i] / 255;
			const csg = s[i + 1] / 255;
			const csb = s[i + 2] / 255;

			if (ab <= 0) {
				d[i] = s[i];
				d[i + 1] = s[i + 1];
				d[i + 2] = s[i + 2];
				d[i + 3] = s[i + 3];
				continue;
			}

			const cbr = d[i] / 255;
			const cbg = d[i + 1] / 255;
			const cbb = d[i + 2] / 255;

			let br = 0, bg = 0, bb = 0;

			switch (blendMode) {
				case 'linear-burn':
					br = Math.max(0, cbr + csr - 1.0);
					bg = Math.max(0, cbg + csg - 1.0);
					bb = Math.max(0, cbb + csb - 1.0);
					break;
				case 'linear-light':
					br = Math.max(0, Math.min(1.0, cbr + 2.0 * csr - 1.0));
					bg = Math.max(0, Math.min(1.0, cbg + 2.0 * csg - 1.0));
					bb = Math.max(0, Math.min(1.0, cbb + 2.0 * csb - 1.0));
					break;
				case 'vivid-light': {
					const vl = (b, sc) => {
						if (sc <= 0.5) {
							if (b >= 1.0) return 1.0;
							if (sc <= 0.0) return 0.0;
							return Math.max(0.0, 1.0 - (1.0 - b) / (2.0 * sc));
						} else {
							if (b <= 0.0) return 0.0;
							if (sc >= 1.0) return 1.0;
							return Math.min(1.0, b / (2.0 * (1.0 - sc)));
						}
					};
					br = vl(cbr, csr);
					bg = vl(cbg, csg);
					bb = vl(cbb, csb);
					break;
				}
				case 'pin-light': {
					const pl = (b, sc) => (sc <= 0.5) ? Math.min(b, 2.0 * sc) : Math.max(b, 2.0 * (sc - 0.5));
					br = pl(cbr, csr);
					bg = pl(cbg, csg);
					bb = pl(cbb, csb);
					break;
				}
				case 'hard-mix':
					br = (cbr + csr >= 1.0) ? 1.0 : 0.0;
					bg = (cbg + csg >= 1.0) ? 1.0 : 0.0;
					bb = (cbb + csb >= 1.0) ? 1.0 : 0.0;
					break;
				case 'subtract':
					br = Math.max(0, cbr - csr);
					bg = Math.max(0, cbg - csg);
					bb = Math.max(0, cbb - csb);
					break;
				case 'divide': {
					const div = (b, sc) => (b <= 0.0) ? 0.0 : ((sc <= 0.0) ? 1.0 : Math.min(1.0, b / sc));
					br = div(cbr, csr);
					bg = div(cbg, csg);
					bb = div(cbb, csb);
					break;
				}
				case 'darker-color': {
					if (lum601(csr, csg, csb) < lum601(cbr, cbg, cbb)) {
						br = csr; bg = csg; bb = csb;
					} else {
						br = cbr; bg = cbg; bb = cbb;
					}
					break;
				}
				case 'lighter-color': {
					if (lum601(csr, csg, csb) > lum601(cbr, cbg, cbb)) {
						br = csr; bg = csg; bb = csb;
					} else {
						br = cbr; bg = cbg; bb = cbb;
					}
					break;
				}
				case 'luminosity': {
					const lumS = lum601(csr, csg, csb);
					const diff = lumS - lum601(cbr, cbg, cbb);
					const clipped = clipColor(cbr + diff, cbg + diff, cbb + diff);
					br = clipped[0];
					bg = clipped[1];
					bb = clipped[2];
					break;
				}
				default:
					br = csr; bg = csg; bb = csb;
			}

			const ao = as + ab * (1.0 - as);
			if (ao <= 0.0001) {
				d[i + 3] = 0;
				continue;
			}

			const cor = (as * (1.0 - ab) * csr + ab * (1.0 - as) * cbr + as * ab * br) / ao;
			const cog = (as * (1.0 - ab) * csg + ab * (1.0 - as) * cbg + as * ab * bg) / ao;
			const cob = (as * (1.0 - ab) * csb + ab * (1.0 - as) * cbb + as * ab * bb) / ao;

			d[i] = Math.round(Math.max(0, Math.min(1.0, cor)) * 255);
			d[i + 1] = Math.round(Math.max(0, Math.min(1.0, cog)) * 255);
			d[i + 2] = Math.round(Math.max(0, Math.min(1.0, cob)) * 255);
			d[i + 3] = Math.round(Math.max(0, Math.min(1.0, ao)) * 255);
		}

		destCtx.putImageData(imgDest, 0, 0);
	}
}

export default Base_layers_class;
