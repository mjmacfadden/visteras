import app from './../../app.js';
import config from './../../config.js';
import Base_tools_class from './../../core/base-tools.js';
import Base_layers_class from './../../core/base-layers.js';
import Vector_manager from './../../core/vector/vector-manager.js';
import Vector_renderer from './../../core/vector/vector-renderer.js';
import { Vector } from './../../core/vector/vector-model.js';
import { create_custom_shape_subpath } from './../../core/vector/vector-shapes.js';
import { Insert_vector_action } from './../../actions/vector/insert-vector.js';
import { Modify_path_action } from './../../actions/vector/modify-path.js';

class Custom_shape_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.ctx = ctx;
		this.name = 'custom_shape';
		this.layer = {};
		this.best_ratio = 1;
		this.snap_line_info = { x: null, y: null };
		this.mouse_click = { x: null, y: null };
		this.is_drawing = false;
		this.active_vector_id = null;
	}

	load() {
		this.default_events();
	}

	_get_shape_name(params) {
		const shape = params ? params.shape : null;
		if (shape != null && typeof shape === 'object') {
			return String(shape.value || shape.shape || shape.title || 'Heart').trim();
		}
		return typeof shape === 'string' && shape ? shape.trim() : 'Heart';
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
		const shapeName = this._get_shape_name(params);
		const fill = (params.fill && params.fill !== 'none') ? (params.fill_color || params.fill || '#cccccc') : null;
		const stroke = (params.stroke && params.stroke !== 'none') ? (params.border_color || params.stroke || '#000000') : null;
		const stroke_width = Number(params.stroke_width?.value ?? params.stroke_width ?? params.border_size ?? 2);
		const stroke_align = (params.stroke_align?.value ?? params.stroke_align ?? 'center').toLowerCase();
		const stroke_corners = (params.stroke_corners?.value ?? params.stroke_corners ?? 'right angle').toLowerCase();
		const stroke_join = stroke_corners === 'rounded' ? 'round' : (stroke_corners === 'capped' ? 'bevel' : 'miter');
		const stroke_cap = stroke_join === 'round' ? 'round' : (stroke_join === 'bevel' ? 'square' : 'butt');

		const subpath = create_custom_shape_subpath(shapeName, mouse_x, mouse_y, 0, 0);
		const vectorCount = (config.vectors ? config.vectors.length : 0) + 1;

		const vec = new Vector({
			name: shapeName + ' ' + vectorCount,
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
		const shapeName = this._get_shape_name(params);
		const isShift = e.shiftKey || params.square === true || params.circle === true;
		const isAlt = e.altKey;

		let width = Math.abs(mouse_x - click_x);
		let height = Math.abs(mouse_y - click_y);

		if (isShift) {
			const size = Math.max(width, height);
			width = size;
			height = size;
		}

		let start_x = mouse_x >= click_x ? click_x : click_x - width;
		let start_y = mouse_y >= click_y ? click_y : click_y - height;

		if (isAlt) {
			start_x = click_x - width;
			start_y = click_y - height;
			width = width * 2;
			height = height * 2;
		}

		const vec = Vector_manager.get_vector_by_id(this.active_vector_id);
		if (!vec) return;

		const subpath = create_custom_shape_subpath(shapeName, start_x, start_y, width, height);
		vec.paths = [subpath];

		app.State.do_action(
			new Modify_path_action(this.active_vector_id, {
				subpath_index: 0,
				subpath: subpath
			})
		);
		config.need_render = true;
	}

	mouseup(e) {
		if (!this.is_drawing) return;
		this.is_drawing = false;
		this.active_vector_id = null;
		this.snap_line_info = { x: null, y: null };
		config.need_render = true;
	}

	render_overlay(ctx) {
		const vec = Vector_manager.get_vector_by_id(this.active_vector_id);
		if (vec && this.is_drawing) {
			Vector_renderer.render_overlay(ctx, {
				vector: vec,
				active_subpath_index: 0,
				active_anchor_index: null
			});
		}
	}

	demo(ctx, x, y, width, height) {
		const params = this.getParams();
		const shapeName = this._get_shape_name(params);
		const subpath = create_custom_shape_subpath(shapeName, x, y, width, height);
		const demoVec = new Vector({
			fill: '#aaaaaa',
			stroke: '#555555',
			stroke_width: 2,
			paths: [subpath]
		});
		Vector_renderer.render_vector(ctx, demoVec);
	}

	render(ctx, layer, is_preview) {
		const vecId = layer.vector_id || (layer.params && layer.params.vector_id);
		const vec = Vector_manager.get_vector_by_id(vecId);
		if (vec && vec.visible) {
			Vector_renderer.render_vector(ctx, vec);
		}
	}

}

export default Custom_shape_class;
