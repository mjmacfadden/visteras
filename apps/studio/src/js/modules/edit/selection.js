import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import Selection_class from './../../tools/selection.js';
import Dialog_class from './../../libs/popup.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

class Edit_selection_class {

	constructor() {
		this.Base_layers = new Base_layers_class();
		this.Selection = new Selection_class(this.Base_layers.ctx);
		this.POP = new Dialog_class();
	}

	select_all() {
		const textTool = (window.app && window.app.GUI && window.app.GUI.GUI_tools && window.app.GUI.GUI_tools.tools_modules['text'])
			? window.app.GUI.GUI_tools.tools_modules['text'].object
			: null;
		const isTextEditing = textTool && (textTool.focused || (typeof textTool.is_cursor_active === 'function' ? textTool.is_cursor_active() : false));
		if (isTextEditing && config.layer && config.layer.type === 'text') {
			textTool.select_all_text();
			return;
		}
		this.Selection.select_all();
	}

	deselect() {
		this.Selection.clear_selection();
	}

	invert_selection() {
		this.Selection.invert_selection();
	}

	invert() {
		this.invert_selection();
	}

	delete() {
		this.Selection.delete_selection();
	}

	fill_foreground() {
		this.Selection.fill(config.COLOR || '#000000');
	}

	fill_background() {
		this.Selection.fill(config.COLOR_BG || '#ffffff');
	}

	expand() {
		const baseSel = (app.Layers && app.Layers.Base_selection)
			? app.Layers.Base_selection
			: (this.Selection ? this.Selection.Base_selection : null);

		if (!baseSel || !baseSel.has_selection) {
			alertify.warning('No selection to expand.');
			return;
		}

		const old_mask = baseSel.clone_mask_canvas();

		const settings = {
			title: 'Expand Selection',
			params: [
				{
					name: 'radius',
					title: 'Expand By (pixels):',
					value: 5,
					type: 'number',
					comment: 'Positive values expand, negative values contract.',
				},
			],
			on_change: function (params) {
				const r = parseInt(params.radius, 10);
				const previewCanvas = baseSel.expand_mask(old_mask, isNaN(r) ? 0 : r);
				baseSel.set_mask_canvas(previewCanvas);
				config.need_render = true;
			},
			on_finish: function (params) {
				const r = parseInt(params.radius, 10);
				const finalRadius = isNaN(r) ? 0 : r;
				const finalCanvas = baseSel.expand_mask(old_mask, finalRadius);

				// Restore old mask first so that Set_selection_action's do() executes the state change
				baseSel.set_mask_canvas(old_mask);

				app.State.do_action(
					new app.Actions.Bundle_action('expand_selection', finalRadius >= 0 ? 'Expand Selection' : 'Contract Selection', [
						new app.Actions.Set_selection_action(finalCanvas, old_mask)
					])
				);
				config.need_render = true;
			},
			on_cancel: function () {
				baseSel.set_mask_canvas(old_mask);
				config.need_render = true;
			},
		};

		this.POP.show(settings);
	}
}

export default Edit_selection_class;
