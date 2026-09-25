import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import Base_selection_class from './../core/base-selection.js';
import GUI_tools_class from './../core/gui/gui-tools.js';
import Layer_raster_class from './../modules/layer/raster.js';
import Helper_class from './../libs/helpers.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import { normalize_raster_layer_to_document } from './../libs/paint-target.js';

var instance = null;

class Selection_class extends Base_tools_class {

	constructor(ctx) {
		super();

		//singleton
		if (instance) {
			return instance;
		}
		instance = this;

		var _this = this;

		this.Base_layers = new Base_layers_class();
		this.Layer_raster = new Layer_raster_class();
		this.Helper = new Helper_class();
		this.ctx = ctx;
		this.name = 'selection';
		this.type = null;
		this.tmpCanvas = null;
		this.tmpCanvasCtx = null;
		this.selection_coords_from = null;
		this.move_last = null;
		this.shift_key = false;
		this.mode = null;
		this.lasso_path = null;
		this.old_mask_snapshot = null;
		this.selection = {
			x: null,
			y: null,
			width: null,
			height: null,
			shape: 'rect',
			path: null,
			regions: null,
			active_region: null,
		};

		var sel_config = {
			enable_background: false,
			enable_borders: false,
			enable_controls: false,
			enable_rotation: false,
			enable_move: false,
			marching_ants_mode: true,
			data_function: function () {
				if (_this.Base_selection && typeof _this.Base_selection.get_selection_data === 'function') {
					return _this.Base_selection.get_selection_data();
				}
				return _this.selection;
			},
		};
		this.Base_selection = new Base_selection_class(ctx, sel_config, this.name);
		this.GUI_tools = new GUI_tools_class();
	}

	/**
	 * returns the active marquee shape: 'rect' | 'ellipse' | 'lasso'
	 */
	get_shape() {
		for (var i in config.TOOLS) {
			if (config.TOOLS[i].name == 'selection' && config.TOOLS[i].tool_group != null
				&& config.TOOLS[i].tool_group.active_shape != null) {
				return config.TOOLS[i].tool_group.active_shape;
			}
		}
		return 'rect';
	}

	load() {
		// Event routing is handled centrally by Base_tools_class
		document.addEventListener('keydown', (e) => {
			var code = e.keyCode;
			var key = e.key;
			if (this.Helper.is_input(e.target) || this.Helper.is_input(document.activeElement))
				return;
			const textTool = (app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules['text'])
				? app.GUI.GUI_tools.tools_modules['text'].object
				: null;
			if (textTool && (textTool.focused || (typeof textTool.is_cursor_active === 'function' && textTool.is_cursor_active())))
				return;

			if (code == 27 || key === 'Escape') {
				//escape - clear the selection
				if (this.Base_selection.has_selection) {
					this.clear_selection();
				}
			}
			if (e.altKey && !e.ctrlKey && !e.metaKey && (code == 46 || code == 8 || key === 'Delete' || key === 'Backspace')) {
				//Alt/Option + Delete/Backspace - fill with foreground color
				e.preventDefault();
				this.fill(config.COLOR || '#000000');
				return;
			}
			if ((e.ctrlKey || e.metaKey) && !e.altKey && (code == 46 || code == 8 || key === 'Delete' || key === 'Backspace')) {
				//Ctrl/Cmd + Delete/Backspace - fill with background color
				e.preventDefault();
				this.fill(config.COLOR_BG || '#ffffff');
				return;
			}
			if (!e.altKey && !e.ctrlKey && !e.metaKey && (code == 46 || code == 8 || key === 'Delete' || key === 'Backspace')) {
				//delete / backspace - delete the selected area on the active layer
				if (this.Base_selection.has_selection) {
					e.preventDefault();
					this.delete_selection();
				}
			}
			if ((code == 65 || key === 'a' || key === 'A') && (e.ctrlKey == true || e.metaKey)) {
				//Ctrl+A / Cmd+A - select all
				e.preventDefault();
				this.select_all();
			}
			if ((code == 68 || key === 'd' || key === 'D') && (e.ctrlKey == true || e.metaKey)) {
				//Ctrl+D / Cmd+D - deselect
				e.preventDefault();
				this.clear_selection();
			}
			if ((code == 73 || key === 'i' || key === 'I') && (e.ctrlKey == true || e.metaKey) && e.shiftKey) {
				//Ctrl+Shift+I / Cmd+Shift+I - invert selection
				e.preventDefault();
				this.invert_selection();
			}
			if (code >= 37 && code <= 40 && config.TOOL.name == this.name
				&& this.Base_selection.has_selection) {
				//arrow keys - nudge selection
				e.preventDefault();
				var step = e.shiftKey ? 10 : 1;
				var dx = 0;
				var dy = 0;
				if (code == 37)
					dx = -step;
				else if (code == 39)
					dx = step;
				else if (code == 38)
					dy = -step;
				else if (code == 40)
					dy = step;
				this.translate_selection(dx, dy);
				config.need_render = true;
			}
		}, false);
	}

	dragStart(event) {
		var _this = this;
		if (config.TOOL.name != _this.name)
			return;
		_this.mousedown(event);
	}

	dragMove(event) {
		var _this = this;
		if (config.TOOL.name != _this.name)
			return;
		_this.mousemove(event);
	}

	dragEnd(event) {
		var _this = this;
		if (config.TOOL.name != _this.name)
			return;
		_this.mouseup(event);
	}

	mousedown(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false)
			return;

		var shift = (e.shiftKey == true) || (app.GUI && app.GUI.GUI_shortcuts && app.GUI.GUI_shortcuts.is_shift_down === true);
		var alt = (e.altKey == true) || (app.GUI && app.GUI.GUI_shortcuts && app.GUI.GUI_shortcuts.is_alt_down === true);

		var mode = null;
		if (shift && alt) {
			mode = 'intersect';
		}
		else if (shift) {
			mode = 'add';
		}
		else if (alt) {
			mode = 'subtract';
		}
		this.mode = mode;

		this.Base_selection._preview_contours = null;
		this.Base_selection._preview_lasso_path = null;
		this.old_mask_snapshot = this.Base_selection.clone_mask_canvas();

		if (mode == null && this.Base_selection.has_selection && this.Base_selection.point_inside_selection(mouse.x, mouse.y)) {
			//move selection mask
			this.type = 'move';
			this.move_last = { x: mouse.x, y: mouse.y };
		}
		else {
			//create a new selection region
			this.type = 'create';
			var start_x = Math.round(mouse.x);
			var start_y = Math.round(mouse.y);
			this.selection_coords_from = { x: start_x, y: start_y };
			if (this.get_shape() === 'lasso') {
				this.lasso_path = [[start_x, start_y]];
			} else {
				this.lasso_path = null;
			}
		}
	}

	mousemove(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.is_drag == false)
			return;
		if (this.type == null)
			return;

		if (this.type === 'move') {
			var dx = Math.round(mouse.x - this.move_last.x);
			var dy = Math.round(mouse.y - this.move_last.y);
			if (dx !== 0 || dy !== 0) {
				this.Base_selection.translate_selection(dx, dy);
				this.move_last = { x: mouse.x, y: mouse.y };
			}
			return;
		}

		if (this.type === 'create') {
			var start_x = this.selection_coords_from ? this.selection_coords_from.x : Math.round(mouse.click_x);
			var start_y = this.selection_coords_from ? this.selection_coords_from.y : Math.round(mouse.click_y);
			var cur_x = Math.round(mouse.x);
			var cur_y = Math.round(mouse.y);
			var shape = this.get_shape();

			var shift = (e.shiftKey == true) || (app.GUI && app.GUI.GUI_shortcuts && app.GUI.GUI_shortcuts.is_shift_down === true);
			var alt = (e.altKey == true) || (app.GUI && app.GUI.GUI_shortcuts && app.GUI.GUI_shortcuts.is_alt_down === true);

			var active_mode = this.mode;
			if (active_mode == null) {
				if (shift && alt) active_mode = 'intersect';
				else if (alt) active_mode = 'subtract';
				else if (shift && this.Base_selection.has_selection) active_mode = 'add';
			}

			if (shape === 'lasso') {
				var last = this.lasso_path[this.lasso_path.length - 1];
				var ldx = cur_x - last[0];
				var ldy = cur_y - last[1];
				if (ldx * ldx + ldy * ldy >= 4) {
					this.lasso_path.push([cur_x, cur_y]);
				}
				this.Base_selection._preview_contours = null;
				this.Base_selection._preview_lasso_path = this.lasso_path;
				config.need_render = true;
			} else {
				this.Base_selection._preview_lasso_path = null;
				var w = cur_x - start_x;
				var h = cur_y - start_y;
				if (shift && this.mode == null) {
					var size = Math.max(Math.abs(w), Math.abs(h));
					w = w < 0 ? -size : size;
					h = h < 0 ? -size : size;
				}
				var params = this.getParams();
				var anti_alias = (params.anti_aliasing?.value ?? params.anti_aliasing) !== false;
				this.Base_selection.compute_preview_contours(
					shape, start_x, start_y, w, h, null, active_mode, anti_alias
				);
			}
		}
	}

	mouseup(e) {
		var mouse = this.get_mouse_info(e);

		var type = this.type;
		var mode = this.mode;
		var start_coords = this.selection_coords_from;

		this.type = null;
		this.mode = null;
		this.selection_coords_from = null;

		if (type == null)
			return;

		if (type === 'move') {
			this.Base_selection._preview_contours = null;
			app.State.do_action(
				new app.Actions.Set_selection_action(
					this.Base_selection.clone_mask_canvas(),
					this.old_mask_snapshot
				)
			);
			return;
		}

		if (type === 'create') {
			var shape = this.get_shape();
			var path = this.lasso_path;
			this.lasso_path = null;

			var shift = (e.shiftKey == true) || (app.GUI && app.GUI.GUI_shortcuts && app.GUI.GUI_shortcuts.is_shift_down === true);
			var alt = (e.altKey == true) || (app.GUI && app.GUI.GUI_shortcuts && app.GUI.GUI_shortcuts.is_alt_down === true);
			if (mode == null) {
				if (shift && alt) mode = 'intersect';
				else if (alt) mode = 'subtract';
				else if (shift && this.Base_selection.has_selection) mode = 'add';
			}

			var valid = false;
			var x = 0, y = 0, width = 0, height = 0;

			if (shape === 'lasso') {
				if (path && path.length >= 3) {
					valid = true;
				}
			} else {
				var start_x = start_coords != null ? start_coords.x : (mouse.click_x != null ? Math.round(mouse.click_x) : Math.round(mouse.x));
				var start_y = start_coords != null ? start_coords.y : (mouse.click_y != null ? Math.round(mouse.click_y) : Math.round(mouse.y));
				var cur_x = Math.round(mouse.x);
				var cur_y = Math.round(mouse.y);
				var w = cur_x - start_x;
				var h = cur_y - start_y;
				if (shift && this.mode == null) {
					var size = Math.max(Math.abs(w), Math.abs(h));
					w = w < 0 ? -size : size;
					h = h < 0 ? -size : size;
				}
				if (Math.abs(w) > 0 && Math.abs(h) > 0) {
					valid = true;
					x = start_x;
					y = start_y;
					width = w;
					height = h;
				}
			}

			this.Base_selection._preview_contours = null;
			this.Base_selection._preview_lasso_path = null;

			if (valid) {
				var params = this.getParams();
				var anti_alias = (params.anti_aliasing?.value ?? params.anti_aliasing) !== false;
				this.Base_selection.apply_shape_to_mask(shape, x, y, width, height, path, mode, this.Base_selection.mask_ctx, anti_alias);
				this.Base_selection.update_mask_state();
				app.State.do_action(
					new app.Actions.Set_selection_action(
						this.Base_selection.clone_mask_canvas(),
						this.old_mask_snapshot
					)
				);
			} else {
				if (mode == null) {
					this.clear_selection();
				} else {
					this.Base_selection.set_mask_canvas(this.old_mask_snapshot);
				}
			}
		}
	}

	translate_selection(dx, dy) {
		this.Base_selection.translate_selection(dx, dy);
	}

	get_regions(data) {
		if (this.Base_selection && this.Base_selection.selection_bounds) {
			var b = this.Base_selection.selection_bounds;
			return [{
				shape: 'rect',
				x: b.min_x,
				y: b.min_y,
				width: b.width,
				height: b.height,
				mode: 'add',
			}];
		}
		return [];
	}

	has_selection_regions() {
		return this.Base_selection.has_selection;
	}

	selection_data_extra() {
		return {
			shape: this.get_shape(),
			path: null,
			regions: null,
		};
	}

	build_selection_path(ctx, data) {
		this.Base_selection.build_selection_path(ctx, data);
	}

	point_inside_selection(x, y) {
		return this.Base_selection.point_inside_selection(x, y);
	}

	select_all() {
		var old_mask = this.Base_selection.clone_mask_canvas();
		this.Base_selection.select_all();
		app.State.do_action(
			new app.Actions.Set_selection_action(
				this.Base_selection.clone_mask_canvas(),
				old_mask
			)
		);
	}

	invert_selection() {
		var old_mask = this.Base_selection.clone_mask_canvas();
		this.Base_selection.invert_selection();
		app.State.do_action(
			new app.Actions.Set_selection_action(
				this.Base_selection.clone_mask_canvas(),
				old_mask
			)
		);
	}

	render(ctx, layer) {
		//nothing
	}

	create_selection_mask_canvas(width, height, layer) {
		return this.Base_selection.create_layer_selection_alpha(layer);
	}

	delete_selection() {
		if (!config.layer) {
			alertify.error('No layer selected.');
			return;
		}
		if (!this.Base_selection.has_selection) {
			alertify.error('Nothing is selected.');
			return;
		}
		this.Base_selection.bake_selection_clips();

		if (config.mask_active === true && config.layer.mask != null) {
			this.fill('#000000');
			return;
		}

		if (config.layer.type === 'adjustment') {
			alertify.error('Cannot delete pixels on an adjustment layer.');
			return;
		}

		if (config.layer.type !== 'image') {
			this.Layer_raster.raster();
		}

		var layer = config.layer;
		if (!layer || layer.type !== 'image') {
			alertify.error('Unable to delete selection on this layer.');
			return;
		}

		normalize_raster_layer_to_document(layer);

		var ow = layer.width_original || layer.width || config.WIDTH;
		var oh = layer.height_original || layer.height || config.HEIGHT;
		var mask = this.Base_selection.create_layer_selection_alpha(layer);

		var is_locked = (layer.locked === true);
		var bgColor = config.COLOR_BG || '#ffffff';

		var delCanvas = document.createElement('canvas');
		delCanvas.width = ow;
		delCanvas.height = oh;
		var delCtx = delCanvas.getContext('2d');
		var src = layer.link_canvas || layer.link;
		if (src) {
			delCtx.drawImage(src, 0, 0, ow, oh);
		}

		if (is_locked) {
			var originalSnapshot = document.createElement('canvas');
			originalSnapshot.width = ow;
			originalSnapshot.height = oh;
			originalSnapshot.getContext('2d').drawImage(delCanvas, 0, 0);

			var editedCanvas = document.createElement('canvas');
			editedCanvas.width = ow;
			editedCanvas.height = oh;
			var ectx = editedCanvas.getContext('2d');
			ectx.drawImage(delCanvas, 0, 0);
			ectx.fillStyle = bgColor;
			ectx.fillRect(0, 0, ow, oh);

			this.Base_selection.restore_outside_selection(editedCanvas, originalSnapshot, layer);
			delCtx.clearRect(0, 0, ow, oh);
			delCtx.drawImage(editedCanvas, 0, 0);
		} else {
			delCtx.save();
			delCtx.globalCompositeOperation = 'destination-out';
			delCtx.drawImage(mask, 0, 0);
			delCtx.restore();
		}

		app.State.do_action(
			new app.Actions.Bundle_action('delete_selection', 'Delete Selection', [
				new app.Actions.Update_layer_image_action(delCanvas, layer.id)
			])
		);

		config.need_render = true;
	}

	init_tmp_canvas() {
		var layer = config.layer;
		if (!layer) return;
		var lw = layer.width_original || layer.width || config.WIDTH;
		var lh = layer.height_original || layer.height || config.HEIGHT;
		this.tmpCanvas = document.createElement('canvas');
		this.tmpCanvas.width = lw;
		this.tmpCanvas.height = lh;
		this.tmpCanvasCtx = this.tmpCanvas.getContext('2d');
		var src = layer.link_canvas || layer.link;
		if (src) {
			this.tmpCanvasCtx.drawImage(src, 0, 0, lw, lh);
		}
	}

	fill(color) {
		if (config.mask_active === true && config.layer && config.layer.mask != null) {
			const layer = config.layer;
			const source = layer.mask.link_canvas || layer.mask.link;
			if (source) {
				const maskCanvas = document.createElement('canvas');
				maskCanvas.width = source.width;
				maskCanvas.height = source.height;
				const mctx = maskCanvas.getContext('2d');
				mctx.drawImage(source, 0, 0);

				let fillStyle = color;
				try {
					const rgb = this.Helper.hexToRgb(color);
					if (rgb && typeof rgb.r === 'number') {
						const gray = Math.round(0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b);
						fillStyle = 'rgb(' + gray + ', ' + gray + ', ' + gray + ')';
					}
				} catch (e) {}

				if (this.Base_selection.has_selection) {
					const originalMask = document.createElement('canvas');
					originalMask.width = source.width;
					originalMask.height = source.height;
					originalMask.getContext('2d').drawImage(source, 0, 0);

					const editedMask = document.createElement('canvas');
					editedMask.width = source.width;
					editedMask.height = source.height;
					const emctx = editedMask.getContext('2d');
					emctx.drawImage(source, 0, 0);
					emctx.fillStyle = fillStyle;
					emctx.fillRect(0, 0, source.width, source.height);

					this.Base_selection.restore_outside_selection(editedMask, originalMask, {
						x: layer.mask.x || 0,
						y: layer.mask.y || 0,
						width: source.width,
						height: source.height,
						width_original: source.width,
						height_original: source.height,
					});
					mctx.clearRect(0, 0, source.width, source.height);
					mctx.drawImage(editedMask, 0, 0);
				} else {
					mctx.fillStyle = fillStyle;
					mctx.fillRect(0, 0, source.width, source.height);
				}

				app.State.do_action(
					new app.Actions.Bundle_action('fill_mask', 'Fill Mask', [
						new app.Actions.Update_layer_mask_image_action(maskCanvas, layer.id)
					])
				);
				config.need_render = true;
				return;
			}
		}

		if (!config.layer) {
			var new_layer = {
				name: 'Layer 1',
				type: 'image',
				link: document.createElement('canvas'),
				width: config.WIDTH,
				height: config.HEIGHT,
				width_original: config.WIDTH,
				height_original: config.HEIGHT,
				x: 0,
				y: 0,
			};
			new_layer.link.width = config.WIDTH;
			new_layer.link.height = config.HEIGHT;
			app.State.do_action(new app.Actions.Insert_layer_action(new_layer, false));
		}

		if (config.layer.type === 'adjustment') {
			alertify.error('Cannot fill an adjustment layer. Create a new layer or edit the layer mask.');
			return;
		}

		if (config.layer.type !== 'image') {
			this.Layer_raster.raster();
		}

		var layer = config.layer;
		if (!layer || layer.type !== 'image') {
			alertify.error('Unable to fill this layer.');
			return;
		}

		normalize_raster_layer_to_document(layer);

		var ow = layer.width_original || layer.width || config.WIDTH;
		var oh = layer.height_original || layer.height || config.HEIGHT;

		var fillCanvas = document.createElement('canvas');
		fillCanvas.width = ow;
		fillCanvas.height = oh;
		var fillCtx = fillCanvas.getContext('2d');
		var src = layer.link_canvas || layer.link;
		if (src) {
			fillCtx.drawImage(src, 0, 0, ow, oh);
		}

		if (this.Base_selection.has_selection) {
			var originalSnapshot = document.createElement('canvas');
			originalSnapshot.width = ow;
			originalSnapshot.height = oh;
			originalSnapshot.getContext('2d').drawImage(fillCanvas, 0, 0);

			var editedCanvas = document.createElement('canvas');
			editedCanvas.width = ow;
			editedCanvas.height = oh;
			var ectx = editedCanvas.getContext('2d');
			ectx.drawImage(fillCanvas, 0, 0);
			ectx.fillStyle = color;
			ectx.fillRect(0, 0, ow, oh);

			this.Base_selection.restore_outside_selection(editedCanvas, originalSnapshot, layer);
			fillCtx.clearRect(0, 0, ow, oh);
			fillCtx.drawImage(editedCanvas, 0, 0);
		} else {
			fillCtx.fillStyle = color;
			fillCtx.fillRect(0, 0, ow, oh);
		}

		app.State.do_action(
			new app.Actions.Bundle_action('fill_layer', 'Fill', [
				new app.Actions.Update_layer_image_action(fillCanvas, layer.id)
			])
		);

		config.need_render = true;
	}

	on_leave() {
		delete config.layer.link_canvas;
		this.reset_tmp_canvas();
		return [];
	}


	/**
	 * Options-bar attribute handler (Select Subject quick action).
	 */
	async on_params_update(data) {
		var key = data && data.key;
		if (key !== 'select_subject') {
			return;
		}
		// Keep the button pressed-in look like Crop's Commit button
		var attrs = (config.TOOL && config.TOOL.attributes) ? config.TOOL.attributes : null;
		if (attrs && attrs.select_subject !== undefined) {
			if (typeof attrs.select_subject === 'object') {
				attrs.select_subject.value = true;
			} else {
				attrs.select_subject = true;
			}
		}
		if (this.GUI_tools && typeof this.GUI_tools.show_action_attributes === 'function') {
			this.GUI_tools.show_action_attributes();
		}
		var Bg = null;
		try {
			var BgMod = (await import(/* webpackChunkName: "bg-auto" */ './../modules/tools/bg_auto.js')).default;
			Bg = new BgMod();
		} catch (err) {
			alertify.error('Could not load background-removal tools.');
			console.error(err);
			return;
		}
		await Bg.select_subject();
	}

	clear_selection_actions() {
		this.Base_selection.bake_selection_clips();
		return [new app.Actions.Reset_selection_action(this.selection)];
	}

	clear_selection_from_history() {
		app.State.do_action(
			new app.Actions.Bundle_action('clear_selection', 'Clear Selection', this.clear_selection_actions())
		);
	}

	clear_selection() {
		this.clear_selection_from_history();
	}

	reset_tmp_canvas() {
		this.tmpCanvas = null;
		this.tmpCanvasCtx = null;
	}
}

export default Selection_class;