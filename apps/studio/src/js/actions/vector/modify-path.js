import app from '../../app.js';
import config from '../../config.js';
import { Base_action } from '../base.js';
import { Subpath } from '../../core/vector/vector-model.js';
import Vector_manager from '../../core/vector/vector-manager.js';

export class Modify_path_action extends Base_action {
	/**
	 * @param {string|number} vector_id 
	 * @param {Subpath[]|Object[]} new_paths 
	 * @param {string} [description='Modify Path']
	 * @param {Object} [options]
	 * @param {number|null} [options.active_subpath_index]
	 * @param {number|null} [options.active_anchor_index]
	 */
	constructor(vector_id, new_paths, description = 'Modify Path', options = {}) {
		super('modify_path', description);
		this.vector_id = vector_id;
		this.new_paths = new_paths.map(p => (p instanceof Subpath ? p.clone() : Subpath.fromJSON(p)));
		this.previous_paths = null;
		this.options = options;
		this.previous_subpath_index = Vector_manager.active_subpath_index;
		this.previous_anchor_index = Vector_manager.active_anchor_index;
	}

	async do() {
		super.do();
		if (!config.vectors) return;

		const vec = config.vectors.find(v => v.id === this.vector_id);
		if (!vec) return;

		this.previous_paths = vec.paths.map(p => p.clone());
		vec.paths = this.new_paths.map(p => p.clone());

		if (this.options.active_subpath_index !== undefined) {
			Vector_manager.active_subpath_index = this.options.active_subpath_index;
		}
		if (this.options.active_anchor_index !== undefined) {
			Vector_manager.active_anchor_index = this.options.active_anchor_index;
		}

		// Update layer bounds to match new geometry
		const layer = config.layers && config.layers.find(l => l.type === 'vector' && (l.vector_id === this.vector_id || (l.params && l.params.vector_id === this.vector_id)));
		if (layer) {
			const b = vec.getBounds();
			if (b) {
				layer.x = b.minX;
				layer.y = b.minY;
				layer.width = Math.max(1, b.width);
				layer.height = Math.max(1, b.height);
			}
		}

		if (app.GUI && app.GUI.GUI_properties) {
			app.GUI.GUI_properties.render_properties();
		}
		config.need_render = true;
	}

	async undo() {
		super.undo();
		if (!config.vectors || !this.previous_paths) return;

		const vec = config.vectors.find(v => v.id === this.vector_id);
		if (!vec) return;

		vec.paths = this.previous_paths.map(p => p.clone());

		Vector_manager.active_subpath_index = this.previous_subpath_index;
		Vector_manager.active_anchor_index = this.previous_anchor_index;

		// Update layer bounds
		const layer = config.layers && config.layers.find(l => l.type === 'vector' && (l.vector_id === this.vector_id || (l.params && l.params.vector_id === this.vector_id)));
		if (layer) {
			const b = vec.getBounds();
			if (b) {
				layer.x = b.minX;
				layer.y = b.minY;
				layer.width = Math.max(1, b.width);
				layer.height = Math.max(1, b.height);
			}
		}

		if (app.GUI && app.GUI.GUI_properties) {
			app.GUI.GUI_properties.render_properties();
		}
		config.need_render = true;
	}
}
