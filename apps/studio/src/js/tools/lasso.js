import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import Base_selection_class from './../core/base-selection.js';
import Layer_raster_class from './../modules/layer/raster.js';
import Helper_class from './../libs/helpers.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

var instance = null;

class Lasso_tool_class extends Base_tools_class {

	constructor(ctx) {
		super();

		if (instance) {
			return instance;
		}
		instance = this;

		this.Base_layers = new Base_layers_class();
		this.Layer_raster = new Layer_raster_class();
		this.Helper = new Helper_class();
		this.ctx = ctx;
		this.name = 'lasso';

		this.lasso_path = null;
		this.poly_path = null;
		this.poly_mode = null;
		this.is_drawing = false;
		this.old_mask_snapshot = null;
		this.mode = null;
		this.type = null;
		this.move_last = null;
		this.tmpCanvas = null;
		this.tmpCanvasCtx = null;

		var sel_config = {
			enable_background: false,
			enable_borders: false,
			enable_controls: false,
			enable_rotation: false,
			enable_move: false,
			marching_ants_mode: true,
			data_function: () => {
				if (this.Base_selection && typeof this.Base_selection.get_selection_data === 'function') {
					return this.Base_selection.get_selection_data();
				}
				return null;
			},
		};
		this.Base_selection = new Base_selection_class(ctx, sel_config, this.name);
	}

	get_shape() {
		for (var i in config.TOOLS) {
			if (config.TOOLS[i].name === 'lasso' && config.TOOLS[i].tool_group != null
				&& config.TOOLS[i].tool_group.active_shape != null) {
				return config.TOOLS[i].tool_group.active_shape;
			}
		}
		return 'lasso';
	}

	load() {
		document.addEventListener('keydown', (e) => {
			if (config.TOOL && config.TOOL.name !== this.name) return;
			if (this.Helper.is_input(e.target) || this.Helper.is_input(document.activeElement)) return;

			var code = e.keyCode;
			var key = e.key;

			// Escape - Cancel polygon in progress or clear active selection
			if (code === 27 || key === 'Escape') {
				if (this.poly_path != null) {
					e.preventDefault();
					this.cancel_polygon();
					return;
				}
				if (this.Base_selection.has_selection) {
					e.preventDefault();
					this.clear_selection();
					return;
				}
			}

			// Enter / Return - Finish polygonal lasso
			if (key === 'Enter' || key === 'Return' || code === 13) {
				if (this.poly_path != null && this.poly_path.length >= 3) {
					e.preventDefault();
					this.finish_polygon();
					return;
				}
			}

			// Backspace / Delete
			if (code === 46 || code === 8 || key === 'Delete' || key === 'Backspace') {
				if (!e.altKey && !e.ctrlKey && !e.metaKey && this.poly_path != null) {
					e.preventDefault();
					this.undo_poly_vertex();
					return;
				}
				if (e.altKey && !e.ctrlKey && !e.metaKey) {
					// Alt + Delete = fill foreground
					e.preventDefault();
					this.fill(config.COLOR || '#000000');
					return;
				}
				if ((e.ctrlKey || e.metaKey) && !e.altKey) {
					// Ctrl + Delete = fill background
					e.preventDefault();
					this.fill(config.COLOR_BG || '#ffffff');
					return;
				}
				if (!e.altKey && !e.ctrlKey && !e.metaKey) {
					// Delete selection pixels on active layer
					if (this.Base_selection.has_selection) {
						e.preventDefault();
						this.delete_selection();
						return;
					}
				}
			}

			// Ctrl+A / Cmd+A - select all
			if ((code === 65 || key === 'a' || key === 'A') && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				this.select_all();
				return;
			}

			// Ctrl+D / Cmd+D - deselect
			if ((code === 68 || key === 'd' || key === 'D') && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				this.clear_selection();
				return;
			}

			// Ctrl+Shift+I / Cmd+Shift+I - invert selection
			if ((code === 73 || key === 'i' || key === 'I') && (e.ctrlKey || e.metaKey) && e.shiftKey) {
				e.preventDefault();
				this.invert_selection();
				return;
			}
		}, false);
	}

	on_leave() {
		if (this.poly_path != null) {
			this.cancel_polygon();
		}
		if (this.is_drawing) {
			this.is_drawing = false;
			this.lasso_path = null;
			this.Base_selection._preview_lasso_path = null;
			config.need_render = true;
		}
	}

	dragStart(event) {
		if (config.TOOL.name !== this.name) return;
		this.mousedown(event);
	}

	dragMove(event) {
		if (config.TOOL.name !== this.name) return;
		this.mousemove(event);
	}

	dragEnd(event) {
		if (config.TOOL.name !== this.name) return;
		this.mouseup(event);
	}

	mousedown(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid === false) return;

		var shape = this.get_shape();
		var shift = (e.shiftKey === true) || (app.GUI && app.GUI.GUI_shortcuts && app.GUI.GUI_shortcuts.is_shift_down === true);
		var alt = (e.altKey === true) || (app.GUI && app.GUI.GUI_shortcuts && app.GUI.GUI_shortcuts.is_alt_down === true);

		var mode = null;
		if (shift && alt) {
			mode = 'intersect';
		} else if (shift) {
			mode = 'add';
		} else if (alt) {
			mode = 'subtract';
		}

		if (shape === 'polygonal_lasso') {
			this.mousedown_polygonal(mouse, mode, e);
		} else {
			this.mousedown_freehand(mouse, mode, e);
		}
	}

	mousedown_freehand(mouse, mode, e) {
		this.mode = mode;
		this.old_mask_snapshot = this.Base_selection.clone_mask_canvas();

		if (mode == null && this.Base_selection.has_selection && this.Base_selection.point_inside_selection(mouse.x, mouse.y)) {
			// Move selection mask
			this.type = 'move';
			this.move_last = { x: mouse.x, y: mouse.y };
		} else {
			// Create new freehand lasso
			this.type = 'create';
			this.is_drawing = true;
			var start_x = Math.round(mouse.x);
			var start_y = Math.round(mouse.y);
			this.lasso_path = [[start_x, start_y]];
			this.Base_selection._preview_lasso_path = this.lasso_path;
			this.Base_selection.start_marching_ants();
			config.need_render = true;
		}
	}

	mousedown_polygonal(mouse, mode, e) {
		var cur_x = Math.round(mouse.x);
		var cur_y = Math.round(mouse.y);

		if (this.poly_path == null) {
			// Starting a new polygonal lasso
			this.poly_mode = mode;
			this.old_mask_snapshot = this.Base_selection.clone_mask_canvas();
			this.poly_path = [[cur_x, cur_y]];
			this.Base_selection._preview_lasso_path = [[cur_x, cur_y], [cur_x, cur_y]];
			this.Base_selection.start_marching_ants();
			config.need_render = true;
			return;
		}

		// In progress: check if clicked near start point to close
		var dx = cur_x - this.poly_path[0][0];
		var dy = cur_y - this.poly_path[0][1];
		if (Math.hypot(dx, dy) <= 10 && this.poly_path.length >= 3) {
			this.finish_polygon();
			return;
		}

		// Check for double click
		if (e && e.detail >= 2 && this.poly_path.length >= 3) {
			this.finish_polygon();
			return;
		}

		// Add vertex to polygon
		this.poly_path.push([cur_x, cur_y]);
		this.Base_selection._preview_lasso_path = [...this.poly_path, [cur_x, cur_y]];
		config.need_render = true;
	}

	mousemove(e) {
		var shape = this.get_shape();
		if (shape === 'polygonal_lasso') {
			this.mousemove_polygonal(e);
		} else {
			this.mousemove_freehand(e);
		}
	}

	mousemove_freehand(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.is_drag === false || this.type == null) return;

		if (this.type === 'move') {
			var dx = Math.round(mouse.x - this.move_last.x);
			var dy = Math.round(mouse.y - this.move_last.y);
			if (dx !== 0 || dy !== 0) {
				this.Base_selection.translate_selection(dx, dy);
				this.move_last = { x: mouse.x, y: mouse.y };
			}
			return;
		}

		if (this.type === 'create' && this.is_drawing && this.lasso_path) {
			var cur_x = Math.round(mouse.x);
			var cur_y = Math.round(mouse.y);
			var last = this.lasso_path[this.lasso_path.length - 1];
			if (Math.hypot(cur_x - last[0], cur_y - last[1]) >= 2) {
				this.lasso_path.push([cur_x, cur_y]);
				this.Base_selection._preview_lasso_path = this.lasso_path;
				config.need_render = true;
			}
		}
	}

	mousemove_polygonal(e) {
		if (!this.poly_path || this.poly_path.length === 0) return;

		var mouse = this.get_mouse_info(e);
		var cur_x = Math.round(mouse.x);
		var cur_y = Math.round(mouse.y);

		// Snap to start point if hovering near it
		var dx = cur_x - this.poly_path[0][0];
		var dy = cur_y - this.poly_path[0][1];
		var targetPt = (Math.hypot(dx, dy) <= 10 && this.poly_path.length >= 3)
			? [this.poly_path[0][0], this.poly_path[0][1]]
			: [cur_x, cur_y];

		this.Base_selection._preview_lasso_path = [...this.poly_path, targetPt];
		config.need_render = true;
	}

	mouseup(e) {
		var shape = this.get_shape();
		if (shape === 'lasso') {
			this.mouseup_freehand(e);
		}
	}

	mouseup_freehand(e) {
		if (this.type === 'move') {
			this.type = null;
			this.move_last = null;
			return;
		}

		if (this.type === 'create' && this.is_drawing) {
			this.is_drawing = false;
			var path = this.lasso_path;
			this.lasso_path = null;
			this.Base_selection._preview_lasso_path = null;

			if (path && path.length >= 3) {
				var params = this.getParams();
				var anti_alias = (params.anti_aliasing?.value ?? params.anti_aliasing) !== false;
				this.Base_selection.apply_shape_to_mask('lasso', 0, 0, 0, 0, path, this.mode, this.Base_selection.mask_ctx, anti_alias);
				this.Base_selection.update_mask_state();
				app.State.do_action(
					new app.Actions.Bundle_action('lasso_selection', 'Lasso Selection', [
						new app.Actions.Set_selection_action(
							this.Base_selection.clone_mask_canvas(),
							this.old_mask_snapshot
						)
					])
				);
			} else {
				if (this.mode == null) {
					this.clear_selection();
				} else {
					this.Base_selection.set_mask_canvas(this.old_mask_snapshot);
				}
			}

			this.type = null;
			config.need_render = true;
		}
	}

	doubleClick(e) {
		var shape = this.get_shape();
		if (shape === 'polygonal_lasso' && this.poly_path != null && this.poly_path.length >= 3) {
			this.finish_polygon();
		}
	}

	async finish_polygon() {
		if (!this.poly_path || this.poly_path.length < 3) {
			this.cancel_polygon();
			return;
		}

		var path = this.poly_path;
		var mode = this.poly_mode;
		var oldMask = this.old_mask_snapshot;

		this.poly_path = null;
		this.poly_mode = null;
		this.old_mask_snapshot = null;
		this.Base_selection._preview_lasso_path = null;

		var params = this.getParams();
		var anti_alias = (params.anti_aliasing?.value ?? params.anti_aliasing) !== false;
		this.Base_selection.apply_shape_to_mask('polygonal_lasso', 0, 0, 0, 0, path, mode, this.Base_selection.mask_ctx, anti_alias);
		this.Base_selection.update_mask_state();

		await app.State.do_action(
			new app.Actions.Bundle_action('polygonal_lasso_selection', 'Polygonal Lasso Selection', [
				new app.Actions.Set_selection_action(
					this.Base_selection.clone_mask_canvas(),
					oldMask
				)
			])
		);
		config.need_render = true;
	}

	cancel_polygon() {
		this.poly_path = null;
		this.poly_mode = null;
		this.Base_selection._preview_lasso_path = null;
		if (this.old_mask_snapshot) {
			this.Base_selection.set_mask_canvas(this.old_mask_snapshot);
			this.old_mask_snapshot = null;
		}
		config.need_render = true;
	}

	undo_poly_vertex() {
		if (this.poly_path && this.poly_path.length > 1) {
			this.poly_path.pop();
			this.Base_selection._preview_lasso_path = [...this.poly_path];
			config.need_render = true;
		} else {
			this.cancel_polygon();
		}
	}

	async on_params_update(data) {
		var key = data && data.key;
		if (key === 'select_subject') {
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
	}

	clear_selection() {
		if (app.GUI?.GUI_tools?.tools_modules['selection']?.object?.clear_selection) {
			app.GUI.GUI_tools.tools_modules['selection'].object.clear_selection();
		} else {
			this.Base_selection.clear_mask();
		}
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
		if (app.GUI?.GUI_tools?.tools_modules['selection']?.object?.delete_selection) {
			app.GUI.GUI_tools.tools_modules['selection'].object.delete_selection();
		}
	}

	fill(color) {
		if (app.GUI?.GUI_tools?.tools_modules['selection']?.object?.fill) {
			app.GUI.GUI_tools.tools_modules['selection'].object.fill(color);
		}
	}

	select_all() {
		if (app.GUI?.modules && app.GUI.modules['edit/selection']) {
			app.GUI.modules['edit/selection'].select_all();
		} else {
			this.Base_selection.select_all();
		}
	}

	invert_selection() {
		if (app.GUI?.modules && app.GUI.modules['edit/selection']) {
			app.GUI.modules['edit/selection'].invert_selection();
		} else {
			this.Base_selection.invert_selection();
		}
	}
}

export default Lasso_tool_class;
