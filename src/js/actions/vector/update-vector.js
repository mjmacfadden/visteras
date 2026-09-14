import app from '../../app.js';
import config from '../../config.js';
import { Base_action } from '../base.js';
import { Vector, Subpath } from '../../core/vector/vector-model.js';
import Vector_manager from '../../core/vector/vector-manager.js';

export class Update_vector_action extends Base_action {
	/**
	 * @param {string|number} vector_id 
	 * @param {Object} updates - Properties to update (e.g. name, fill, stroke, stroke_width, visible, locked, paths)
	 */
	constructor(vector_id, updates = {}) {
		super('update_vector', 'Update Vector');
		this.vector_id = vector_id;
		this.updates = updates;
		this.previous_state = {};
	}

	async do() {
		super.do();
		if (!config.vectors) return;

		const vec = config.vectors.find(v => v.id === this.vector_id);
		if (!vec) return;

		this.previous_state = {};
		for (const key in this.updates) {
			if (key === 'paths' && Array.isArray(this.updates.paths)) {
				this.previous_state.paths = vec.paths.map(p => p.clone());
				vec.paths = this.updates.paths.map(p => (p instanceof Subpath ? p.clone() : Subpath.fromJSON(p)));
			} else {
				this.previous_state[key] = vec[key];
				vec[key] = this.updates[key];
			}
		}

		// Sync with layer if exists
		const layer = config.layers && config.layers.find(l => l.type === 'vector' && (l.vector_id === this.vector_id || (l.params && l.params.vector_id === this.vector_id)));
		if (layer) {
			if (this.updates.name !== undefined) layer.name = vec.name;
			if (this.updates.visible !== undefined) layer.visible = vec.visible;
			if (this.updates.locked !== undefined) layer.locked = vec.locked;
			if (this.updates.opacity !== undefined) layer.opacity = vec.opacity;
			if (!layer.params) layer.params = {};
			layer.params.fill = vec.fill;
			layer.params.stroke = vec.stroke;
			layer.params.stroke_width = vec.stroke_width;
			layer.params.stroke_align = vec.stroke_align;
			layer.params.stroke_join = vec.stroke_join;
			layer.params.stroke_cap = vec.stroke_cap;
			layer.params.mode = vec.mode;
		}

		if (app.GUI && app.GUI.GUI_vectors) {
			app.GUI.GUI_vectors.render_vectors();
		}
		if (app.GUI && app.GUI.GUI_layers) {
			app.GUI.GUI_layers.render_layers();
		}
		if (app.GUI && app.GUI.GUI_properties) {
			app.GUI.GUI_properties.render_properties();
		}
		config.need_render = true;
	}

	async undo() {
		super.undo();
		if (!config.vectors) return;

		const vec = config.vectors.find(v => v.id === this.vector_id);
		if (!vec) return;

		for (const key in this.previous_state) {
			if (key === 'paths' && Array.isArray(this.previous_state.paths)) {
				vec.paths = this.previous_state.paths.map(p => p.clone());
			} else {
				vec[key] = this.previous_state[key];
			}
		}

		// Sync with layer if exists
		const layer = config.layers && config.layers.find(l => l.type === 'vector' && (l.vector_id === this.vector_id || (l.params && l.params.vector_id === this.vector_id)));
		if (layer) {
			if (this.previous_state.name !== undefined) layer.name = vec.name;
			if (this.previous_state.visible !== undefined) layer.visible = vec.visible;
			if (this.previous_state.locked !== undefined) layer.locked = vec.locked;
			if (this.previous_state.opacity !== undefined) layer.opacity = vec.opacity;
			if (!layer.params) layer.params = {};
			layer.params.fill = vec.fill;
			layer.params.stroke = vec.stroke;
			layer.params.stroke_width = vec.stroke_width;
			layer.params.stroke_align = vec.stroke_align;
			layer.params.stroke_join = vec.stroke_join;
			layer.params.stroke_cap = vec.stroke_cap;
			layer.params.mode = vec.mode;
		}

		if (app.GUI && app.GUI.GUI_vectors) {
			app.GUI.GUI_vectors.render_vectors();
		}
		if (app.GUI && app.GUI.GUI_layers) {
			app.GUI.GUI_layers.render_layers();
		}
		if (app.GUI && app.GUI.GUI_properties) {
			app.GUI.GUI_properties.render_properties();
		}
		config.need_render = true;
	}
}
