import app from '../../app.js';
import config from '../../config.js';
import { Base_action } from '../base.js';

export class Reorder_vector_action extends Base_action {
	/**
	 * @param {string|number} vector_id 
	 * @param {number} new_index 
	 */
	constructor(vector_id, new_index) {
		super('reorder_vector', 'Reorder Vector');
		this.vector_id = vector_id;
		this.new_index = new_index;
		this.old_index = -1;
	}

	async do() {
		super.do();
		if (!config.vectors) return;

		this.old_index = config.vectors.findIndex(v => v.id === this.vector_id);
		if (this.old_index === -1 || this.old_index === this.new_index) return;

		const [moved] = config.vectors.splice(this.old_index, 1);
		config.vectors.splice(this.new_index, 0, moved);

		if (app.GUI && app.GUI.GUI_vectors) {
			app.GUI.GUI_vectors.render_vectors();
		}
		config.need_render = true;
	}

	async undo() {
		super.undo();
		if (!config.vectors || this.old_index === -1) return;

		const currIdx = config.vectors.findIndex(v => v.id === this.vector_id);
		if (currIdx === -1) return;

		const [moved] = config.vectors.splice(currIdx, 1);
		config.vectors.splice(this.old_index, 0, moved);

		if (app.GUI && app.GUI.GUI_vectors) {
			app.GUI.GUI_vectors.render_vectors();
		}
		config.need_render = true;
	}
}
