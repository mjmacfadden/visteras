import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

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
				'new_from_visible', 'New from Visible', [
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
