import app from './../../app.js';
import config from './../../config.js';
import Base_tools_class from './../../core/base-tools.js';
import Base_layers_class from './../../core/base-layers.js';
import Vector_manager from './../../core/vector/vector-manager.js';
import Vector_renderer from './../../core/vector/vector-renderer.js';
import { Vector } from './../../core/vector/vector-model.js';
import { create_rectangle_subpath } from './../../core/vector/vector-shapes.js';
import { Insert_vector_action } from './../../actions/vector/insert-vector.js';
import { Modify_path_action } from './../../actions/vector/modify-path.js';

class Rectangle_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.ctx = ctx;
		this.name = 'rectangle';
		this.layer = {};
		this.best_ratio = 1;
		this.snap_line_info = {x: null, y: null};
		this.mouse_click = {x: null, y: null};
		this.is_drawing = false;
		this.active_vector_id = null;
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
		const stroke_corners = (params.stroke_corners?.value ?? params.stroke_corners ?? 'right angle').toLowerCase();
		const stroke_join = stroke_corners === 'rounded' ? 'round' : (stroke_corners === 'capped' ? 'bevel' : 'miter');
		const stroke_cap = stroke_join === 'round' ? 'round' : (stroke_join === 'bevel' ? 'square' : 'butt');
		const radius = Number(params.radius?.value ?? params.radius ?? 0);

		const subpath = create_rectangle_subpath(mouse_x, mouse_y, 0, 0, radius);
		const vectorCount = (config.vectors ? config.vectors.length : 0) + 1;

		const vec = new Vector({
			name: 'Rectangle ' + vectorCount,
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
		this.active_vector_id = vec.id;
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
		const isShift = e.shiftKey || params.square === true;
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

		const radius = Number(params.radius?.value ?? params.radius ?? 0);
		const subpath = create_rectangle_subpath(x, y, width, height, radius);

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
		const isShift = e.shiftKey || params.square === true;
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

		const radius = Number(params.radius?.value ?? params.radius ?? 0);
		const vec = Vector_manager.get_active_vector();
		if (!vec) return;

		// If click without drag, create a default 100x100 rectangle
		if (width < 2 && height < 2) {
			x = click_x - 50;
			y = click_y - 50;
			width = 100;
			height = 100;
		}

		const subpath = create_rectangle_subpath(x, y, width, height, radius);
		vec.paths = [subpath];

		app.State.do_action(
			new Modify_path_action(vec.id, vec.paths, 'Create Rectangle', {
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
		const coords = [
			[0, 0],
			[100, 0],
			[100, 100],
			[0, 100],
			[0, 0],
		];
		this.draw_shape(ctx, x, y, width, height, coords);
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
		const fill = params.fill;
		const stroke = params.border;
		const radius = params.radius || 0;

		ctx.save();
		ctx.strokeStyle = params.border ? params.border_color : 'transparent';
		ctx.fillStyle = params.fill ? params.fill_color : 'transparent';
		ctx.lineWidth = params.border_size || 4;
		this.roundRect(ctx, layer.x, layer.y, layer.width, layer.height, radius, fill, stroke);
		ctx.restore();
	}

	roundRect(ctx, x, y, width, height, radius, fill, stroke) {
		x = parseInt(x);
		y = parseInt(y);
		width = parseInt(width);
		height = parseInt(height);
		if (width < 0) {
			width = Math.abs(width);
			x = x - width;
		}
		if (height < 0) {
			height = Math.abs(height);
			y = y - height;
		}
		radius = parseInt(radius || 0);

		ctx.beginPath();
		ctx.moveTo(x + radius, y);
		ctx.lineTo(x + width - radius, y);
		ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
		ctx.lineTo(x + width, y + height - radius);
		ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
		ctx.lineTo(x + radius, y + height);
		ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
		ctx.lineTo(x, y + radius);
		ctx.quadraticCurveTo(x, y, x + radius, y);
		ctx.closePath();
		if (stroke) ctx.stroke();
		if (fill) ctx.fill();
	}
}

export default Rectangle_class;
