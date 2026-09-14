import app from '../../app.js';
import config from '../../config.js';
import { Base_action } from '../base.js';
import Vector_manager from '../../core/vector/vector-manager.js';

export class Delete_vector_action extends Base_action {
	/**
	 * @param {string|number} vector_id 
	 */
	constructor(vector_id) {
		super('delete_vector', 'Delete Vector');
		this.vector_id = vector_id;
		this.deleted_vector = null;
		this.deleted_index = -1;
		this.previous_active_id = null;
		this.delete_layer_action = null;
	}

	async do() {
		super.do();
		if (!config.vectors) return;

		const idx = config.vectors.findIndex(v => v.id === this.vector_id);
		if (idx > -1) {
			this.deleted_vector = config.vectors[idx].clone();
			this.deleted_index = idx;
			this.previous_active_id = Vector_manager.active_vector_id;

			config.vectors.splice(idx, 1);

			// Delete corresponding vector layer
			const layer = config.layers && config.layers.find(l => l.type === 'vector' && (l.vector_id === this.vector_id || (l.params && l.params.vector_id === this.vector_id)));
			if (layer) {
				this.delete_layer_action = new app.Actions.Delete_layer_action(layer.id, true);
				await this.delete_layer_action.do();
			}

			if (Vector_manager.active_vector_id === this.vector_id) {
				const nextVec = config.vectors[Math.max(0, idx - 1)] || null;
				Vector_manager.set_active_vector(nextVec ? nextVec.id : null);
			} else {
				if (app.GUI && app.GUI.GUI_vectors) {
					app.GUI.GUI_vectors.render_vectors();
				}
				if (app.GUI && app.GUI.GUI_layers) {
					app.GUI.GUI_layers.render_layers();
				}
				config.need_render = true;
			}
		}
	}

	async undo() {
		super.undo();
		if (this.delete_layer_action) {
			await this.delete_layer_action.undo();
			this.delete_layer_action.free();
			this.delete_layer_action = null;
		}

		if (!this.deleted_vector || !config.vectors) return;

		const restoreVec = this.deleted_vector.clone();
		if (this.deleted_index >= 0 && this.deleted_index <= config.vectors.length) {
			config.vectors.splice(this.deleted_index, 0, restoreVec);
		} else {
			config.vectors.push(restoreVec);
		}

		Vector_manager.set_active_vector(this.previous_active_id || restoreVec.id);
		if (app.GUI && app.GUI.GUI_vectors) {
			app.GUI.GUI_vectors.render_vectors();
		}
		if (app.GUI && app.GUI.GUI_layers) {
			app.GUI.GUI_layers.render_layers();
		}
		config.need_render = true;
	}

	free() {
		if (this.delete_layer_action) {
			this.delete_layer_action.free();
			this.delete_layer_action = null;
		}
	}
}
