import app from './../../app.js';
import config from './../../config.js';
import Base_tools_class from './../../core/base-tools.js';
import Base_layers_class from './../../core/base-layers.js';
import Vector_manager from './../../core/vector/vector-manager.js';
import Vector_renderer from './../../core/vector/vector-renderer.js';
import { Vector } from './../../core/vector/vector-model.js';
import { create_ellipse_subpath } from './../../core/vector/vector-shapes.js';
import { Insert_vector_action } from './../../actions/vector/insert-vector.js';
import { Modify_path_action } from './../../actions/vector/modify-path.js';

class Ellipse_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.ctx = ctx;
		this.name = 'ellipse';
		this.layer = {};
		this.best_ratio = 1;
		this.snap_line_info = {x: null, y: null};
		this.mouse_click = {x: null, y: null};
		this.is_drawing = false;
	}

	load() {
		this.default_events();
	}

	mousedown(e) {
		const mouse = this.get_mouse_info(e);
		if (!mouse.click_valid) return;

		let mouse_x = mouse.x;
		let mouse_y = mouse.y;

		// Apply snapping
		const snap_info = this.calc_snap_position(e, mouse_x, mouse_y);
		if (snap_info) {
			if (snap_info.x !== null) mouse_x = snap_info.x;
			if (snap_info.y !== null) mouse_y = snap_info.y;
		}

		this.mouse_click.x = mouse_x;
		this.mouse_click.y = mouse_y;

		const params = this.getParams();
		const fill = (params.fill && params.fill !== 'none' && params.fill !== false) ? (params.fill_color || params.fill || '#cccccc') : null;
		const stroke = (params.stroke && params.stroke !== 'none' && params.border !== false) ? (params.border_color || params.stroke || '#000000') : null;
		const stroke_width = Number(params.stroke_width?.value ?? params.stroke_width ?? params.border_size ?? 2);
		const stroke_align = (params.stroke_align?.value ?? params.stroke_align ?? 'center').toLowerCase();
		const stroke_corners = (params.stroke_corners?.value ?? params.stroke_corners ?? 'rounded').toLowerCase();
		const stroke_join = stroke_corners === 'right angle' ? 'miter' : (stroke_corners === 'capped' ? 'bevel' : 'round');
		const stroke_cap = stroke_join === 'round' ? 'round' : (stroke_join === 'bevel' ? 'square' : 'butt');

		const subpath = create_ellipse_subpath(mouse_x, mouse_y, 0, 0);
		const vectorCount = (config.vectors ? config.vectors.length : 0) + 1;

		const vec = new Vector({
			name: 'Ellipse ' + vectorCount,
			mode: (params.mode === 'Path' || params.mode?.value === 'Path') ? 'path' : 'shape',
			fill: fill,
			stroke: stroke,
			stroke_width: stroke_width,
			stroke_align: stroke_align,
			stroke_join: stroke_join,
			stroke_cap: stroke_cap,
			paths: [subpath]
		});

		app.State.do_action(new Insert_vector_action(vec));
		this.is_drawing = true;
		config.need_render = true;
	}

	mousemove(e) {
		const mouse = this.get_mouse_info(e);
		if (!this.is_drawing || !mouse.is_drag || !mouse.click_valid) return;

		let mouse_x = Math.round(mouse.x);
		let mouse_y = Math.round(mouse.y);
		const click_x = Math.round(this.mouse_click.x);
		const click_y = Math.round(this.mouse_click.y);

		const snap_info = this.calc_snap_position(e, mouse_x, mouse_y, config.layer ? config.layer.id : null);
		if (snap_info) {
			if (snap_info.x !== null) mouse_x = snap_info.x;
			if (snap_info.y !== null) mouse_y = snap_info.y;
		}

		const params = this.getParams();
		const isShift = e.shiftKey || params.circle === true;
		const isAlt = e.altKey;

		let width = Math.abs(mouse_x - click_x);
		let height = Math.abs(mouse_y - click_y);

		if (isShift) {
			const side = Math.max(width, height);
			width = side;
			height = side;
		}

		let x, y;
		if (isAlt) {
			x = click_x - width;
			y = click_y - height;
			width *= 2;
			height *= 2;
		} else {
			x = mouse_x < click_x ? click_x - width : click_x;
			y = mouse_y < click_y ? click_y - height : click_y;
		}

		const subpath = create_ellipse_subpath(x, y, width, height);

		const vec = Vector_manager.get_active_vector();
		if (vec) {
			vec.paths = [subpath];
		}

		if (config.layer && config.layer.type === 'vector') {
			config.layer.x = x;
			config.layer.y = y;
			config.layer.width = width;
			config.layer.height = height;
		}

		config.need_render = true;
	}

	mouseup(e) {
		if (!this.is_drawing) return;
		this.is_drawing = false;
		this.snap_line_info = { x: null, y: null };

		const mouse = this.get_mouse_info(e);
		let mouse_x = Math.round(mouse.x);
		let mouse_y = Math.round(mouse.y);
		const click_x = Math.round(this.mouse_click.x);
		const click_y = Math.round(this.mouse_click.y);

		const params = this.getParams();
		const isShift = e.shiftKey || params.circle === true;
		const isAlt = e.altKey;

		let width = Math.abs(mouse_x - click_x);
		let height = Math.abs(mouse_y - click_y);

		if (isShift) {
			const side = Math.max(width, height);
			width = side;
			height = side;
		}

		let x, y;
		if (isAlt) {
			x = click_x - width;
			y = click_y - height;
			width *= 2;
			height *= 2;
		} else {
			x = mouse_x < click_x ? click_x - width : click_x;
			y = mouse_y < click_y ? click_y - height : click_y;
		}

		const vec = Vector_manager.get_active_vector();
		if (!vec) return;

		// If click without drag, create a default 100x100 circle
		if (width < 2 && height < 2) {
			x = click_x - 50;
			y = click_y - 50;
			width = 100;
			height = 100;
		}

		const subpath = create_ellipse_subpath(x, y, width, height);
		vec.paths = [subpath];

		app.State.do_action(
			new Modify_path_action(vec.id, vec.paths, 'Create Ellipse', {
				active_subpath_index: 0,
				active_anchor_index: 0
			})
		);

		Vector_manager.set_active_vector(vec.id);
		Vector_manager.active_subpath_index = 0;
		config.need_render = true;
	}

	render_overlay(ctx) {
		const vec = Vector_manager.get_active_vector();
		if (vec) {
			Vector_renderer.render_overlay(ctx, {
				vector: vec,
				active_subpath_index: Vector_manager.active_subpath_index,
				active_anchor_index: Vector_manager.active_anchor_index
			});
		}
		this.render_overlay_parent(ctx);
	}

	demo(ctx, x, y, width, height) {
		ctx.beginPath();
		ctx.arc(x + width / 2, y + height / 2, width / 2, 0, Math.PI * 2);
		ctx.stroke();
	}

	render(ctx, layer, is_preview) {
		if (!layer || layer.visible === false) return;
		const vecId = layer.vector_id || (layer.params && layer.params.vector_id);
		const vec = (config.vectors && config.vectors.find(v => v.id === vecId)) || layer.vector;
		if (vec && vec.visible !== false) {
			Vector_renderer.render_vector(ctx, vec);
			return;
		}

		// Fallback for legacy raster layers
		const params = layer.params || {};
		ctx.save();
		ctx.strokeStyle = params.border ? params.border_color : 'transparent';
		ctx.fillStyle = params.fill ? params.fill_color : 'transparent';
		ctx.lineWidth = params.border_size || 4;
		ctx.beginPath();
		ctx.ellipse(layer.x + layer.width / 2, layer.y + layer.height / 2, layer.width / 2, layer.height / 2, 0, 0, Math.PI * 2);
		if (params.fill) ctx.fill();
		if (params.border) ctx.stroke();
		ctx.restore();
	}
}

export default Ellipse_class;
