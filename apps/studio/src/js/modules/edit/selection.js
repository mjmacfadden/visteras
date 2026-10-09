import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import Selection_class from './../../tools/selection.js';
import Dialog_class from './../../libs/popup.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import { rgba_to_alpha, alpha_to_rgba, feather_alpha, smooth_alpha, border_split, border_alpha } from './../../libs/selection-modify.js';

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

	_base_selection() {
		return (app.Layers && app.Layers.Base_selection)
			? app.Layers.Base_selection
			: (this.Selection ? this.Selection.Base_selection : null);
	}

	_canvas_alpha(canvas) {
		return rgba_to_alpha(canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data);
	}

	_alpha_canvas(alpha, W, H) {
		const c = document.createElement('canvas');
		c.width = W;
		c.height = H;
		const ctx = c.getContext('2d');
		const img = ctx.createImageData(W, H);
		alpha_to_rgba(alpha, img.data);
		ctx.putImageData(img, 0, 0);
		return c;
	}

	/**
	 * Shared Select ▸ Modify dialog: live preview on the marching ants, one
	 * undoable Set_selection step on OK, restore on Cancel.
	 */
	_modify_dialog({ id, title, label, value, min, max, step, history, compute, empty_message }) {
		const baseSel = this._base_selection();
		if (!baseSel || !baseSel.has_selection) {
			alertify.warning(empty_message || 'No selection to modify.');
			return;
		}
		const old_mask = baseSel.clone_mask_canvas();
		const clamp = (v) => {
			const n = parseFloat(v);
			return isNaN(n) ? value : Math.max(min, Math.min(max, n));
		};
		const settings = {
			title,
			params: [{ name: 'radius', title: label, value, type: 'number', min, max, step: step || 1 }],
			on_change: (params) => {
				baseSel.set_mask_canvas(compute(old_mask, clamp(params.radius)));
				config.need_render = true;
			},
			on_finish: (params) => {
				const v = clamp(params.radius);
				const finalCanvas = compute(old_mask, v);
				baseSel.set_mask_canvas(old_mask);
				app.State.do_action(
					new app.Actions.Bundle_action(id, history, [
						new app.Actions.Set_selection_action(finalCanvas, old_mask)
					])
				);
				config.need_render = true;
			},
			on_cancel: () => {
				baseSel.set_mask_canvas(old_mask);
				config.need_render = true;
			},
		};
		this.POP.show(settings);
	}

	feather() {
		this._modify_dialog({
			id: 'feather_selection', title: 'Feather Selection', label: 'Feather Radius (pixels):',
			value: 5, min: 0.1, max: 250, step: 0.1, history: 'Feather Selection',
			empty_message: 'No selection to feather.',
			compute: (src, r) => this._alpha_canvas(feather_alpha(this._canvas_alpha(src), src.width, src.height, r), src.width, src.height),
		});
	}

	smooth() {
		this._modify_dialog({
			id: 'smooth_selection', title: 'Smooth Selection', label: 'Sample Radius (pixels):',
			value: 2, min: 1, max: 100, history: 'Smooth Selection',
			empty_message: 'No selection to smooth.',
			compute: (src, r) => this._alpha_canvas(smooth_alpha(this._canvas_alpha(src), src.width, src.height, r), src.width, src.height),
		});
	}

	border() {
		const baseSel = this._base_selection();
		this._modify_dialog({
			id: 'border_selection', title: 'Border Selection', label: 'Width (pixels):',
			value: 10, min: 1, max: 200, history: 'Border Selection',
			empty_message: 'No selection to border.',
			compute: (src, w) => {
				const split = border_split(w);
				const ex = this._canvas_alpha(baseSel.expand_mask(src, split.out));
				const co = this._canvas_alpha(split.in > 0 ? baseSel.expand_mask(src, -split.in) : src);
				return this._alpha_canvas(border_alpha(ex, co), src.width, src.height);
			},
		});
	}

	contract() {
		const baseSel = this._base_selection();
		this._modify_dialog({
			id: 'contract_selection', title: 'Contract Selection', label: 'Contract By (pixels):',
			value: 5, min: 1, max: 500, history: 'Contract Selection',
			empty_message: 'No selection to contract.',
			compute: (src, r) => baseSel.expand_mask(src, -Math.round(r)),
		});
	}
}

export default Edit_selection_class;
