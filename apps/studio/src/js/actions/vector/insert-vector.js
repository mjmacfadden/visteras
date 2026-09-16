import app from '../../app.js';
import config from '../../config.js';
import { Base_action } from '../base.js';
import { Vector } from '../../core/vector/vector-model.js';
import Vector_manager from '../../core/vector/vector-manager.js';

export class Insert_vector_action extends Base_action {
	/**
	 * @param {Vector|Object} vector_data 
	 * @param {number|null} [insert_index=null]
	 */
	constructor(vector_data, insert_index = null) {
		super('insert_vector', 'New Vector');
		this.vector_data = vector_data instanceof Vector ? vector_data.clone() : Vector.fromJSON(vector_data);
		this.insert_index = insert_index;
		this.inserted_vector_id = this.vector_data.id;
		this.previous_active_id = Vector_manager.active_vector_id;
		this.insert_layer_action = null;
	}

	async do() {
		super.do();
		if (!config.vectors) config.vectors = [];

		const vector = this.vector_data.clone();
		if (this.insert_index !== null && this.insert_index >= 0 && this.insert_index <= config.vectors.length) {
			config.vectors.splice(this.insert_index, 0, vector);
		} else {
			config.vectors.push(vector);
		}

		Vector_manager.set_active_vector(vector.id);

		// Ensure corresponding vector layer exists in config.layers
		const existingLayer = config.layers && config.layers.find(l => l.type === 'vector' && (l.vector_id === vector.id || (l.params && l.params.vector_id === vector.id)));
		if (!existingLayer) {
			const b = vector.getBounds();
			const layer_data = {
				name: vector.name || ('Vector ' + config.vectors.length),
				type: 'vector',
				is_vector: true,
				vector_id: vector.id,
				vector: vector,
				render_function: ['pen', 'render'],
				params: {
					vector_id: vector.id,
					mode: vector.mode,
					fill: vector.fill,
					stroke: vector.stroke,
					stroke_width: vector.stroke_width,
					stroke_align: vector.stroke_align || 'center',
					stroke_join: vector.stroke_join || 'miter',
					stroke_cap: vector.stroke_cap || 'butt'
				},
				x: (b && b.width > 0) ? b.minX : 0,
				y: (b && b.height > 0) ? b.minY : 0,
				width: (b && b.width > 0) ? Math.max(1, b.width) : (config.WIDTH || 800),
				height: (b && b.height > 0) ? Math.max(1, b.height) : (config.HEIGHT || 600),
				visible: vector.visible !== false,
				locked: vector.locked === true,
				opacity: vector.opacity ?? 100,
				composition: 'source-over'
			};
			this.insert_layer_action = new app.Actions.Insert_layer_action(layer_data, false);
			await this.insert_layer_action.do();
		}

		if (app.GUI && app.GUI.GUI_vectors) {
			app.GUI.GUI_vectors.render_vectors();
		}
		if (app.GUI && app.GUI.GUI_layers) {
			app.GUI.GUI_layers.render_layers();
		}
		config.need_render = true;
	}

	async undo() {
		super.undo();
		if (this.insert_layer_action) {
			await this.insert_layer_action.undo();
			this.insert_layer_action.free();
			this.insert_layer_action = null;
		}

		if (config.vectors) {
			const idx = config.vectors.findIndex(v => v.id === this.inserted_vector_id);
			if (idx > -1) {
				config.vectors.splice(idx, 1);
			}
		}

		Vector_manager.set_active_vector(this.previous_active_id);
		if (app.GUI && app.GUI.GUI_vectors) {
			app.GUI.GUI_vectors.render_vectors();
		}
		if (app.GUI && app.GUI.GUI_layers) {
			app.GUI.GUI_layers.render_layers();
		}
		config.need_render = true;
	}

	free() {
		if (this.insert_layer_action) {
			this.insert_layer_action.free();
			this.insert_layer_action = null;
		}
	}
}
