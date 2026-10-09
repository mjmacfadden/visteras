import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import { merge_visible_plan } from './../../libs/merge-plan.js';

class Layer_flatten_class {

	constructor() {
		this.Base_layers = new Base_layers_class();
		document.addEventListener('keydown', (event) => {
			if (!(event.ctrlKey || event.metaKey) || !event.altKey || !event.shiftKey || event.code !== 'KeyE') return;
			if (event.isComposing || event.repeat || event.target?.isContentEditable ||
				/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName)) return;
			event.preventDefault();
			this.new_from_visible();
		});
	}

	async new_from_visible() {
		if (this.stamping) return;
		this.stamping = true;
		try {
			const canvas = document.createElement('canvas');
			canvas.width = config.WIDTH;
			canvas.height = config.HEIGHT;
			// Use the export compositor for masks, effects, blend modes,
			// adjustments and inherited group visibility.
			this.Base_layers.convert_layers_to_canvas(canvas.getContext('2d'));
			await app.State.do_action(new app.Actions.Bundle_action(
				'new_from_visible', 'Stamp Visible', [
					new app.Actions.Insert_layer_action({
						name: 'New from Visible',
						type: 'image',
						data: canvas.toDataURL('image/png'),
						x: 0, y: 0,
						width: canvas.width, height: canvas.height,
						width_original: canvas.width, height_original: canvas.height,
						parent_id: null,
						order: Math.max(0, ...config.layers.map(layer => layer.order || 0)) + 1,
					}, false),
				]
			));
		} finally {
			this.stamping = false;
		}
	}

	/** Layer ▸ Merge Visible (Shift+Ctrl/⌘E): one undo step, hidden layers kept. */
	async merge_visible() {
		if (this.merging) return false;
		const plan = merge_visible_plan(config.layers);
		if (!plan.ok) {
			alertify.error(plan.error);
			return false;
		}
		this.merging = true;
		try {
			const canvas = document.createElement('canvas');
			canvas.width = config.WIDTH;
			canvas.height = config.HEIGHT;
			this.Base_layers.convert_layers_to_canvas(canvas.getContext('2d'));
			const W = canvas.width, H = canvas.height;
			const steps = plan.into != null
				? [
					// Locked Background: merge into it, as Photoshop does.
					new app.Actions.Update_layer_action(plan.into, { x: 0, y: 0, width: W, height: H, width_original: W, height_original: H, mask: null, filters: [], opacity: 100, composition: 'source-over' }),
					new app.Actions.Update_layer_image_action(canvas, plan.into),
				]
				: [new app.Actions.Insert_layer_action({
					name: plan.result.name,
					type: 'image',
					data: canvas.toDataURL('image/png'),
					x: 0, y: 0,
					width: W, height: H,
					width_original: W, height_original: H,
					parent_id: plan.result.parent_id || null,
					order: plan.result.order,
				}, false)];
			const res = await app.State.do_action(new app.Actions.Bundle_action('merge_visible', 'Merge Visible', [
				...steps,
				...plan.deleteIds.map((id) => new app.Actions.Delete_layer_action(id)),
			]));
			if (res && res.status === 'aborted') {
				console.warn('Merge Visible aborted', res.reason);
				alertify.error('Merge Visible could not be completed.');
				return false;
			}
			if (plan.into != null) await app.State.do_action(new app.Actions.Select_layer_action(plan.into), { skip_history: true });
			return true;
		} finally {
			this.merging = false;
		}
	}

	flatten() {
		//create tmp canvas
		var canvas = document.createElement('canvas');
		canvas.width = config.WIDTH;
		canvas.height = config.HEIGHT;
		var ctx = canvas.getContext("2d");
		
		var layers_sorted = this.Base_layers.get_sorted_layers();

		//paint layers
		for (var i = layers_sorted.length - 1; i >= 0; i--) {
			var layer = layers_sorted[i];
			
			ctx.globalAlpha = layer.opacity / 100;
			ctx.globalCompositeOperation = layer.composition;

			this.Base_layers.render_object(ctx, layer);
		}

		//create requested layer
		var params = [];
		params.type = 'image';
		params.name = 'Merged';
		params.data = canvas.toDataURL("image/png");

		//remove rest of layers
		let delete_actions = [];
		for (var i = config.layers.length - 1; i >= 0; i--) {
			delete_actions.push(new app.Actions.Delete_layer_action(config.layers[i].id));
		}
		// Run actions
		app.State.do_action(
			new app.Actions.Bundle_action('flatten_image', 'Flatten Image', [
				new app.Actions.Insert_layer_action(params),
				...delete_actions
			])
		);

		canvas.width = 1;
		canvas.height = 1;
	}

}

export default Layer_flatten_class;
