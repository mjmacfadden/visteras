import app from './../app.js';
import config from './../config.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import image_store from './store/image-store.js';
import { Base_action } from './base.js';

export class Update_layer_mask_image_action extends Base_action {
	/**
	 * updates the layer mask bitmap
	 *
	 * @param {canvas} canvas new mask bitmap (native mask size)
	 * @param {int} layer_id (optional)
	 * @param {canvas} old_canvas (optional) snapshot of mask before edits
	 */
	constructor(canvas, layer_id, old_canvas = null) {
		super('update_layer_mask_image', 'Update Layer Mask');
		this.canvas = canvas;
		if (layer_id == null)
			layer_id = config.layer.id;
		this.layer_id = parseInt(layer_id);
		this.old_canvas = old_canvas;
		this.reference_layer = null;
		this.old_image_id = null;
		this.new_image_id = null;
		this.old_database_id = null;
	}

	async do() {
		super.do();
		this.reference_layer = app.Layers.get_layer(this.layer_id);
		if (!this.reference_layer) {
			throw new Error('Aborted - layer with specified id doesn\'t exist');
		}
		if (!this.reference_layer.mask) {
			alertify.error('Error: layer has no mask.');
			throw new Error('Aborted - layer has no mask');
		}

		let data_url;
		if (this.new_image_id) {
			try {
				data_url = await image_store.get(this.new_image_id);
			} catch (error) {
				throw new Error('Aborted - problem retrieving cached mask from database');
			}
		}
		else if (this.canvas) {
			data_url = this.canvas.toDataURL('image/png');
		}

		try {
			if (!this.old_image_id) {
				const oldSource = this.old_canvas || (this.reference_layer.mask && this.reference_layer.mask.link);
				if (oldSource && typeof oldSource.toDataURL === 'function') {
					this.old_image_id = await image_store.add(oldSource.toDataURL('image/png'));
				} else if (this.reference_layer.mask && this.reference_layer.mask._mask_database_id) {
					this.old_image_id = this.reference_layer.mask._mask_database_id;
				}
			}
			if (!this.new_image_id && data_url) {
				this.new_image_id = await image_store.add(data_url);
			}
		} catch (error) {
			console.log(error);
			requestAnimationFrame(() => {
				app.State.free(0, this.database_estimate || 1)
			});
		}

		// Estimate storage size
		try {
			if (this.old_image_id) {
				this.database_estimate = new Blob([await image_store.get(this.old_image_id)]).size;
			}
		} catch (e) {}

		// Assign mask content immediately from canvas if available, or decode data_url
		if (this.canvas) {
			const ctx = this.reference_layer.mask.link.getContext('2d');
			if (this.reference_layer.mask.link.width !== this.canvas.width
				|| this.reference_layer.mask.link.height !== this.canvas.height) {
				this.reference_layer.mask.link.width = this.canvas.width;
				this.reference_layer.mask.link.height = this.canvas.height;
			}
			ctx.clearRect(0, 0, this.reference_layer.mask.link.width, this.reference_layer.mask.link.height);
			ctx.drawImage(this.canvas, 0, 0);
		} else if (data_url) {
			const img = new Image();
			await new Promise((resolve, reject) => {
				img.onload = resolve;
				img.onerror = () => reject(new Error('Failed to load mask image'));
				img.src = data_url;
			});
			const ctx = this.reference_layer.mask.link.getContext('2d');
			if (this.reference_layer.mask.link.width !== img.width
				|| this.reference_layer.mask.link.height !== img.height) {
				this.reference_layer.mask.link.width = img.width;
				this.reference_layer.mask.link.height = img.height;
			}
			ctx.clearRect(0, 0, this.reference_layer.mask.link.width, this.reference_layer.mask.link.height);
			ctx.drawImage(img, 0, 0);
		}

		if (this.reference_layer.mask.link_canvas) {
			delete this.reference_layer.mask.link_canvas;
		}

		this.old_database_id = this.reference_layer.mask._mask_database_id;
		this.reference_layer.mask._mask_database_id = this.new_image_id;

		this.canvas = null;
		this.old_canvas = null;
		app.GUI.GUI_layers.render_layers();
		config.need_render = true;
		app.Layers.notify_mask_changed(this.layer_id);
		if (app.Layers && typeof app.Layers.render === 'function') {
			app.Layers.render();
		}
	}

	async undo() {
		super.undo();
		if (!this.reference_layer) {
			this.reference_layer = app.Layers.get_layer(this.layer_id);
		}
		if (!this.reference_layer) {
			throw new Error('Aborted - layer with specified id doesn\'t exist');
		}
		if (!this.reference_layer.mask) {
			return;
		}

		if (this.reference_layer.mask.link_canvas) {
			delete this.reference_layer.mask.link_canvas;
		}

		if (this.old_image_id != null) {
			try {
				const data_url = await image_store.get(this.old_image_id);
				if (!data_url) {
					throw new Error('Failed to retrieve mask data from store');
				}
				const img = new Image();
				await new Promise((resolve, reject) => {
					img.onload = resolve;
					img.onerror = () => reject(new Error('Failed to load mask image'));
					img.src = data_url;
				});
				const ctx = this.reference_layer.mask.link.getContext('2d');
				if (this.reference_layer.mask.link.width !== img.width
					|| this.reference_layer.mask.link.height !== img.height) {
					this.reference_layer.mask.link.width = img.width;
					this.reference_layer.mask.link.height = img.height;
				}
				ctx.clearRect(0, 0, this.reference_layer.mask.link.width, this.reference_layer.mask.link.height);
				ctx.drawImage(img, 0, 0);
			} catch (error) {
				console.error('Update_layer_mask_image_action undo error:', error);
				throw new Error('Failed to retrieve mask from store');
			}
		}
		this.reference_layer.mask._mask_database_id = this.old_database_id;
		this.reference_layer = null;
		app.GUI.GUI_layers.render_layers();
		config.need_render = true;
		app.Layers.notify_mask_changed(this.layer_id);
		if (app.Layers && typeof app.Layers.render === 'function') {
			app.Layers.render();
		}
	}

	async free() {
		let has_error = false;
		if (this.new_image_id != null) {
			try {
				await image_store.delete(this.new_image_id);
			} catch (error) {
				has_error = true;
			}
			this.new_image_id = null;
		}
		if (this.old_image_id != null) {
			try {
				await image_store.delete(this.old_image_id);
			} catch (error) {
				has_error = true;
			}
			this.old_image_id = null;
		}
		this.old_database_id = null;
		this.canvas = null;
		this.old_canvas = null;
		this.reference_layer = null;
		if (has_error) {
			alertify.error('A problem occurred while removing undo history. It\'s suggested you save your work and refresh the page in order to free up memory.');
		}
	}
}