/**
 * Frame Manager for Timeline-Based Animation System
 * Supports multi-frame animation, deep layer cloning, onion skinning, and frame composites.
 */

import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../base-layers.js';
import { Insert_frame_action } from './../../actions/timeline/insert-frame.js';
import { Delete_frame_action } from './../../actions/timeline/delete-frame.js';
import { Reorder_frame_action } from './../../actions/timeline/reorder-frame.js';

var instance = null;

export class Frame_manager_class {

	constructor() {
		if (instance) {
			return instance;
		}
		instance = this;

		this.Base_layers = new Base_layers_class();

		this.frames = [];
		this.active_frame_index = 0;
		this.fps = 12;
		this.onion_skin = false;
		this.onion_skin_opacity = 0.3;
		this.is_timeline_active = false;
		this._composite_cache = new Map();
	}

	/**
	 * Initialize or sync frames with current document
	 */
	init() {
		if (this.frames.length === 0) {
			this.reset_to_current_layers();
		}
	}

	/**
	 * Reset frames array to 1 initial frame based on current config.layers
	 */
	reset_to_current_layers() {
		const clonedLayers = this.clone_layers(config.layers || []);
		if (clonedLayers.length === 1 && clonedLayers[0].locked) {
			clonedLayers[0].locked = false;
			if (config.layers && config.layers[0]) config.layers[0].locked = false;
		}
		this.frames = [
			{
				id: 'frame_' + Date.now() + '_0',
				layers: clonedLayers,
				active_layer_id: config.layer ? config.layer.id : (clonedLayers[0] ? clonedLayers[0].id : 1),
			}
		];
		this.active_frame_index = 0;
		this.clear_composite_cache();
	}

	/**
	 * Clone a list of layer objects including canvas buffers, masks, vectors, and text params.
	 */
	clone_layers(layers) {
		if (!layers || !Array.isArray(layers)) return [];

		return layers.map(source => {
			const layer = JSON.parse(JSON.stringify(source, (key, value) => {
				if (key === 'link' || key === 'link_canvas' || key === '_alpha_canvas' || key === '_alpha_source') {
					return undefined;
				}
				return value;
			}));

			// Clone image raster canvas
			const srcCanvas = source.link_canvas || source.link;
			if (source.type === 'image' && srcCanvas) {
				const newCanvas = document.createElement('canvas');
				newCanvas.width = srcCanvas.width || config.WIDTH || 800;
				newCanvas.height = srcCanvas.height || config.HEIGHT || 600;
				const ctx = newCanvas.getContext('2d');
				try {
					ctx.drawImage(srcCanvas, 0, 0);
				} catch (e) { /* ignore */ }
				layer.link = newCanvas;
			} else if (source.type === 'image') {
				const newCanvas = document.createElement('canvas');
				newCanvas.width = config.WIDTH || 800;
				newCanvas.height = config.HEIGHT || 600;
				layer.link = newCanvas;
			}

			// Clone mask canvas if present
			const srcMask = (source.mask && (source.mask.link_canvas || source.mask.link)) ? (source.mask.link_canvas || source.mask.link) : null;
			if (source.mask && srcMask) {
				const newMaskCanvas = document.createElement('canvas');
				newMaskCanvas.width = srcMask.width || config.WIDTH || 800;
				newMaskCanvas.height = srcMask.height || config.HEIGHT || 600;
				const mctx = newMaskCanvas.getContext('2d');
				try {
					mctx.drawImage(srcMask, 0, 0);
				} catch (e) { /* ignore */ }
				layer.mask = {
					...source.mask,
					link: newMaskCanvas
				};
			}

			return layer;
		});
	}

	/**
	 * Saves live config.layers into the current active frame slot.
	 */
	sync_active_frame() {
		if (!this.frames || this.frames.length === 0) {
			this.reset_to_current_layers();
			return;
		}

		if (this.active_frame_index < 0) this.active_frame_index = 0;
		if (this.active_frame_index >= this.frames.length) this.active_frame_index = this.frames.length - 1;

		const currentFrame = this.frames[this.active_frame_index];
		if (!currentFrame) return;

		// Clone the live layers into current frame
		currentFrame.layers = this.clone_layers(config.layers);
		currentFrame.active_layer_id = config.layer ? config.layer.id : (config.layers[0] ? config.layers[0].id : null);
		
		this.clear_frame_cache(this.active_frame_index);
	}

	/**
	 * Switches the active frame to target index.
	 */
	set_active_frame(index, forceRefresh = true) {
		if (index < 0 || index >= this.frames.length) return;

		// Save current frame state first
		this.sync_active_frame();

		this.active_frame_index = index;
		const targetFrame = this.frames[index];
		if (!targetFrame) return;

		// Mount target frame layers into config.layers
		config.layers = this.clone_layers(targetFrame.layers);

		// Resolve active layer
		let activeLayer = null;
		if (targetFrame.active_layer_id != null) {
			activeLayer = config.layers.find(l => l.id === targetFrame.active_layer_id);
		}
		if (!activeLayer && config.layers.length > 0) {
			activeLayer = config.layers[0];
		}
		config.layer = activeLayer;

		this.clear_frame_cache(index);

		if (forceRefresh) {
			if (this.Base_layers) {
				if (typeof this.Base_layers.notify_all_layers_changed === 'function') {
					this.Base_layers.notify_all_layers_changed();
				} else {
					this.Base_layers.invalidate({ document: true, full: true, preview: true, details: true, ruler: true });
				}
				this.Base_layers.render(true);
			}
			if (app.GUI && app.GUI.GUI_layers && typeof app.GUI.GUI_layers.render_layers === 'function') {
				app.GUI.GUI_layers.render_layers();
			}
			if (app.GUI && app.GUI.GUI_timeline && typeof app.GUI.GUI_timeline.render_timeline === 'function') {
				app.GUI.GUI_timeline.render_timeline();
			}
		}
	}

	/**
	 * Adds a new frame at targetIndex or after current frame.
	 */
	add_frame(targetIndex = null, duplicate = false) {
		const action = new Insert_frame_action(targetIndex, duplicate);
		if (app.State) {
			return app.State.do_action(action);
		} else {
			return action.do();
		}
	}

	/**
	 * Duplicates current active frame or frame at index.
	 */
	duplicate_frame(index = null) {
		const targetIndex = (index !== null) ? index : this.active_frame_index;
		return this.add_frame(targetIndex + 1, true);
	}

	/**
	 * Deletes frame at index. (Keeps minimum 1 frame).
	 */
	delete_frame(index = null) {
		const action = new Delete_frame_action(index);
		if (app.State) {
			return app.State.do_action(action);
		} else {
			return action.do();
		}
	}

	/**
	 * Move frame from one position to another.
	 */
	reorder_frame(fromIndex, toIndex) {
		if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= this.frames.length || toIndex < 0 || toIndex >= this.frames.length) {
			return;
		}
		const action = new Reorder_frame_action(fromIndex, toIndex);
		if (app.State) {
			return app.State.do_action(action);
		} else {
			return action.do();
		}
	}

	/**
	 * Clear cached thumbnail / composite for a frame or all frames.
	 */
	clear_frame_cache(frameIndex) {
		this._composite_cache.delete(frameIndex);
	}

	clear_composite_cache() {
		this._composite_cache.clear();
	}

	/**
	 * Returns a composite rendered canvas of a frame at full document resolution.
	 */
	get_frame_canvas(frameIndex) {
		if (frameIndex < 0 || frameIndex >= this.frames.length) return null;

		const isCurrent = (frameIndex === this.active_frame_index);
		const layers = isCurrent ? config.layers : (this.frames[frameIndex] ? this.frames[frameIndex].layers : []);
		if (!layers || layers.length === 0) return null;

		const docW = config.WIDTH || 800;
		const docH = config.HEIGHT || 600;

		const canvas = document.createElement('canvas');
		canvas.width = docW;
		canvas.height = docH;
		const ctx = canvas.getContext('2d');
		ctx.imageSmoothingEnabled = false;

		// Render layer stack
		const sortedLayers = [...layers].sort((a, b) => (b.order || 0) - (a.order || 0));
		const tempCanvas = document.createElement('canvas');
		tempCanvas.width = docW;
		tempCanvas.height = docH;

		this.Base_layers.render_objects(ctx, tempCanvas, sortedLayers, () => {
			ctx.save();
		});

		if (typeof this.Base_layers.render_vectors === 'function') {
			this.Base_layers.render_vectors(ctx);
		}

		return canvas;
	}

	/**
	 * Returns composite of the previous frame for onion skinning.
	 */
	get_previous_frame_canvas() {
		if (this.frames.length <= 1) return null;
		let prevIndex = this.active_frame_index - 1;
		if (prevIndex < 0) {
			prevIndex = this.frames.length - 1;
		}
		if (prevIndex === this.active_frame_index) return null;

		return this.get_frame_canvas(prevIndex);
	}

	/**
	 * Returns composite of the next frame for onion skinning.
	 */
	get_next_frame_canvas() {
		if (this.frames.length <= 1) return null;
		let nextIndex = (this.active_frame_index + 1) % this.frames.length;
		if (nextIndex === this.active_frame_index) return null;

		return this.get_frame_canvas(nextIndex);
	}
}

export default Frame_manager_class;
