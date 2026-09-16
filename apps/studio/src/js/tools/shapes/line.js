import app from './../../app.js';
import config from './../../config.js';
import Base_tools_class from './../../core/base-tools.js';
import Base_layers_class from './../../core/base-layers.js';
import Vector_manager from './../../core/vector/vector-manager.js';
import Vector_renderer from './../../core/vector/vector-renderer.js';
import { Vector } from './../../core/vector/vector-model.js';
import { create_line_subpath } from './../../core/vector/vector-shapes.js';
import { Insert_vector_action } from './../../actions/vector/insert-vector.js';
import { Modify_path_action } from './../../actions/vector/modify-path.js';

class Line_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.ctx = ctx;
		this.name = 'line';
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
		const stroke = params.stroke || config.COLOR || '#000000';
		const stroke_width = Number(params.size || params.stroke_width || 4);

		const subpath = create_line_subpath(mouse_x, mouse_y, mouse_x, mouse_y);
		const vectorCount = (config.vectors ? config.vectors.length : 0) + 1;

		const vec = new Vector({
			name: 'Line ' + vectorCount,
			mode: 'shape',
			fill: null,
			stroke: stroke,
			stroke_width: stroke_width,
			stroke_align: 'center',
			stroke_join: 'miter',
			stroke_cap: 'round',
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

		if (e.shiftKey) {
			// Constrain to 0, 45, 90 degrees
			const dx = mouse_x - click_x;
			const dy = mouse_y - click_y;
			const dist = Math.sqrt(dx * dx + dy * dy);
			const snap = Math.PI / 4;
			const angle = Math.round(Math.atan2(dy, dx) / snap) * snap;
			mouse_x = Math.round(click_x + Math.cos(angle) * dist);
			mouse_y = Math.round(click_y + Math.sin(angle) * dist);
		}

		const subpath = create_line_subpath(click_x, click_y, mouse_x, mouse_y);

		const vec = Vector_manager.get_active_vector();
		if (vec) {
			vec.paths = [subpath];
		}

		if (config.layer && config.layer.type === 'vector') {
			config.layer.x = Math.min(click_x, mouse_x);
			config.layer.y = Math.min(click_y, mouse_y);
			config.layer.width = Math.abs(mouse_x - click_x);
			config.layer.height = Math.abs(mouse_y - click_y);
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

		if (e.shiftKey) {
			const dx = mouse_x - click_x;
			const dy = mouse_y - click_y;
			const dist = Math.sqrt(dx * dx + dy * dy);
			const snap = Math.PI / 4;
			const angle = Math.round(Math.atan2(dy, dx) / snap) * snap;
			mouse_x = Math.round(click_x + Math.cos(angle) * dist);
			mouse_y = Math.round(click_y + Math.sin(angle) * dist);
		}

		const vec = Vector_manager.get_active_vector();
		if (!vec) return;

		// If click without drag, create a default 100px horizontal line
		if (mouse_x === click_x && mouse_y === click_y) {
			mouse_x = click_x + 100;
		}

		const subpath = create_line_subpath(click_x, click_y, mouse_x, mouse_y);
		vec.paths = [subpath];

		app.State.do_action(
			new Modify_path_action(vec.id, vec.paths, 'Create Line', {
				active_subpath_index: 0,
				active_anchor_index: 1
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
		ctx.moveTo(x, y + height);
		ctx.lineTo(x + width, y);
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
		ctx.strokeStyle = layer.color || config.COLOR || '#000000';
		ctx.lineWidth = params.size || 4;
		ctx.beginPath();
		ctx.moveTo(layer.x, layer.y);
		ctx.lineTo(layer.x + layer.width, layer.y + layer.height);
		ctx.stroke();
		ctx.restore();
	}
}

export default Line_class;
