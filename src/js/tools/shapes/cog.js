import Base_tools_class from './../../core/base-tools.js';
import Base_layers_class from './../../core/base-layers.js';
import Vector_renderer from './../../core/vector/vector-renderer.js';
import { Vector } from './../../core/vector/vector-model.js';
import { create_gear_subpath } from './../../core/vector/vector-shapes.js';

class Cog_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.ctx = ctx;
		this.name = 'cog';
		this.layer = {};
		this.best_ratio = 1;
		this.snap_line_info = {x: null, y: null};
	}

	load() {
		this.default_events();
	}

	mousedown(e) {
		this.shape_mousedown(e);
	}

	mousemove(e) {
		this.shape_mousemove(e);
	}

	mouseup(e) {
		this.shape_mouseup(e);
	}

	render_overlay(ctx){
		var ctx = this.Base_layers.ctx;
		this.render_overlay_parent(ctx);
	}

	demo(ctx, x, y, width, height) {
		const subpath = create_gear_subpath(x, y, width, height, 8);
		const demoVec = new Vector({
			fill: '#777777',
			stroke: '#555555',
			stroke_width: 1,
			paths: [subpath]
		});
		Vector_renderer.render_vector(ctx, demoVec);
	}

	render(ctx, layer) {
		var params = layer.params || {};
		const subpath = create_gear_subpath(layer.x, layer.y, layer.width, layer.height, 8);
		const vec = new Vector({
			fill: params.fill_color || '#777777',
			stroke: params.border_color || 'none',
			stroke_width: params.border_size || 0,
			paths: [subpath]
		});
		Vector_renderer.render_vector(ctx, vec);
	}

	draw_shape(ctx, x, y, width, height) {
		const subpath = create_gear_subpath(x, y, width, height, 8);
		Vector_renderer.draw_subpath(ctx, subpath);
		ctx.fill();
	}

}

export default Cog_class;
