import config from '../config.js';
import app from './../app.js';
import { Base_action } from './base.js';
import { is_group, get_children, get_descendant_ids } from './../libs/layer-tree.js';
import Vector_manager from './../core/vector/vector-manager.js';

export class Delete_layer_action extends Base_action {
	/**
	 * removes layer
	 *
	 * @param {int} id
	 * @param {boolean} force - Force to delete first layer?
	 */
	constructor(layer_id, force) {
		super('delete_layer', 'Delete Layer');
		this.layer_id = parseInt(layer_id);
		this.force = force || false;
		this.insert_layer_action = null;
		this.select_layer_action = null;
		this.delete_index = null;
		this.deleted_layer = null;
		this.deleted_vector = null;
		this.deleted_vector_index = -1;
		// Group delete policy: delete group AND its contents (PS default without prompt).
		this.child_delete_actions = [];
	}

	async do() {
		super.do();
		const id = this.layer_id;
		const force = this.force;

		// Determine if there is a layer to delete, abort if not
		for (var i in config.layers) {
			if (config.layers[i].id == id) {
				this.delete_index = i;
			}
		}
		if (this.delete_index === null) {
			throw new Error('Aborted - Layer to delete not found');
		}

		// Prevent deletion of locked layers
		if (config.layers[this.delete_index].locked && !this.force) {
			throw new Error('Aborted - Cannot delete locked layer');
		}

		if (config.layers.length == 1 && (force == undefined || force == false)) {
			// Only 1 layer left
			if (config.layer.type == null) {
				//STOP
				throw new Error('Aborted - Will not delete last layer');
			}
			else {
				// Delete it, but before that - create new empty layer
				this.insert_layer_action = new app.Actions.Insert_layer_action();
				this.insert_layer_action.do();
			}
		}

		// Layers that will disappear with this delete (group + contents).
		const target_pre = config.layers[this.delete_index];
		const doomed = new Set([id]);
		if (target_pre && is_group(target_pre)) {
			for (const did of get_descendant_ids(id)) {
				doomed.add(parseInt(did, 10));
			}
		}

		// Always move selection off anything about to be deleted. Plain
		// find_next/previous often lands on a child inside a group, which then
		// gets deleted too — leaving config.layer stale. New Layer then parents
		// under a dead group and never shows up in the tree.
		if (config.layer && doomed.has(parseInt(config.layer.id, 10))) {
			const survivor = this._find_survivor(doomed);
			if (survivor) {
				try {
					const select_action = new app.Actions.Select_layer_action(survivor.id, true);
					await select_action.do();
					this.select_layer_action = select_action;
				} catch (error) {
					config.layer = survivor;
					config.selected_layer_ids = [survivor.id];
					config.layer_select_anchor_id = survivor.id;
				}
			}
		}

		// If this is a group, delete descendants first (contents go with the group).
		const target = config.layers[this.delete_index];
		if (target && is_group(target)) {
			// Direct children only; nested groups recursively delete their own contents.
			const kids = get_children(id).slice().reverse();
			for (const child of kids) {
				const child_action = new app.Actions.Delete_layer_action(child.id, true);
				await child_action.do();
				this.child_delete_actions.push(child_action);
			}
			// refresh index after child deletes
			this.delete_index = null;
			for (var i in config.layers) {
				if (config.layers[i].id == id) {
					this.delete_index = i;
				}
			}
			if (this.delete_index === null) {
				throw new Error('Aborted - Group layer vanished while deleting children');
			}
		}

		// Clean up text tool state if text tool is referencing a doomed layer
		const textTool = (app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules['text'])
			? app.GUI.GUI_tools.tools_modules['text'].object
			: null;
		if (textTool && textTool.layer && doomed.has(parseInt(textTool.layer.id, 10))) {
			textTool.focused = false;
			textTool.selecting = false;
			textTool.creating = false;
			textTool.layer = null;
			textTool.focusedValue = null;
			textTool.focusedX = null;
			textTool.focusedY = null;
			textTool.focusedWidth = null;
			textTool.focusedHeight = null;
			if (textTool.textarea) {
				textTool._ignore_textarea_blur = true;
				textTool.textarea.blur();
				textTool._ignore_textarea_blur = false;
			}
		}

		// Remove layer from list
		this.deleted_layer = config.layers.splice(this.delete_index, 1)[0];

		// If deleting a vector layer, also remove corresponding vector
		if (this.deleted_layer && this.deleted_layer.type === 'vector') {
			const vecId = this.deleted_layer.vector_id || (this.deleted_layer.params && this.deleted_layer.params.vector_id);
			if (vecId && config.vectors) {
				const vIdx = config.vectors.findIndex(v => v.id === vecId);
				if (vIdx > -1) {
					this.deleted_vector = config.vectors.splice(vIdx, 1)[0];
					this.deleted_vector_index = vIdx;
					if (Vector_manager.active_vector_id === vecId) {
						const nextVec = config.vectors[Math.max(0, vIdx - 1)] || null;
						Vector_manager.set_active_vector(nextVec ? nextVec.id : null);
					}
					if (app.GUI && app.GUI.GUI_vectors) {
						app.GUI.GUI_vectors.render_vectors();
					}
				}
			}
		}

		// Invalidate renderer texture cache for deleted layer
		app.Layers.notify_layer_data_changed(id);

		// Estimate memory
		if (this.deleted_layer.link && this.deleted_layer.link.src && typeof this.deleted_layer.link.src === 'string') {
			this.memory_estimate = new Blob([this.deleted_layer.link.src]).size;
		}

		// Final safety: never leave config.layer pointing at a removed object.
		if (!config.layer || !config.layers.some((l) => l.id === config.layer.id)) {
			const survivor = config.layers.length ? (app.Layers.get_sorted_layers()[0] || config.layers[0]) : null;
			config.layer = survivor;
			config.selected_layer_ids = survivor ? [survivor.id] : [];
			config.layer_select_anchor_id = survivor ? survivor.id : null;
		}

		app.Layers.render();
		app.GUI.GUI_layers.render_layers();
	}

	/**
	 * Pick a layer that will survive this delete (not in doomed ids).
	 * Prefer neighbors of the primary id in stack order, then any leftover.
	 */
	_find_survivor(doomed) {
		const sorted = app.Layers.get_sorted_layers();
		const alive = sorted.filter((l) => !doomed.has(parseInt(l.id, 10)));
		if (!alive.length) return null;

		// Prefer the layer that sat just above / below the deleted id in the stack.
		const idx = sorted.findIndex((l) => parseInt(l.id, 10) === this.layer_id);
		if (idx !== -1) {
			for (let i = idx - 1; i >= 0; i--) {
				if (!doomed.has(parseInt(sorted[i].id, 10))) return sorted[i];
			}
			for (let i = idx + 1; i < sorted.length; i++) {
				if (!doomed.has(parseInt(sorted[i].id, 10))) return sorted[i];
			}
		}
		return alive[0];
	}

	async undo() {
		super.undo();
		if (this.deleted_layer) {
			config.layers.splice(this.delete_index, 0, this.deleted_layer);
			this.delete_index = null;
			this.deleted_layer = null;
		}

		if (this.deleted_vector && config.vectors) {
			if (this.deleted_vector_index >= 0 && this.deleted_vector_index <= config.vectors.length) {
				config.vectors.splice(this.deleted_vector_index, 0, this.deleted_vector);
			} else {
				config.vectors.push(this.deleted_vector);
			}
			Vector_manager.set_active_vector(this.deleted_vector.id);
			this.deleted_vector = null;
			this.deleted_vector_index = -1;
			if (app.GUI && app.GUI.GUI_vectors) {
				app.GUI.GUI_vectors.render_vectors();
			}
		}

		// Undo child deletes in reverse order (restore deepest first was do; undo shallow-last)
		for (let i = this.child_delete_actions.length - 1; i >= 0; i--) {
			await this.child_delete_actions[i].undo();
			this.child_delete_actions[i].free();
		}
		this.child_delete_actions = [];
		if (this.select_layer_action) {
			await this.select_layer_action.undo();
			this.select_layer_action.free();
			this.select_layer_action = null;
		}
		if (this.insert_layer_action) {
			await this.insert_layer_action.undo();
			this.insert_layer_action.free();
			this.insert_layer_action = null;
		}

		// Estimate memory
		this.memory_estimate = 0;

		app.Layers.render();
		app.GUI.GUI_layers.render_layers();
	}

	free() {
		if (this.deleted_layer) {
			delete this.deleted_layer.link;
			delete this.deleted_layer.data;
		}
		this.deleted_vector = null;
		for (const a of this.child_delete_actions) {
			a.free();
		}
		this.child_delete_actions = [];
		if (this.insert_layer_action) {
			this.insert_layer_action.free();
			this.insert_layer_action = null;
		}
		if (this.select_layer_action) {
			this.select_layer_action.free();
			this.select_layer_action = null;
		}
		this.deleted_layer = null;
	}
}