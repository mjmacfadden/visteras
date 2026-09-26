import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import glfx from './../libs/glfx.js';
import Helper_class from './../libs/helpers.js';

class BulgePinch_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.fx_filter = null;
		this.Helper = new Helper_class();
		this.ctx = ctx;
		this.name = 'bulge_pinch';
		this.tmpCanvas = null;
		this.tmpCanvasCtx = null;
		this.baseCanvas = null;
		this.started = false;
		this.selection_snapshot = null;
	}

	load() {
		// Event routing is handled centrally by Base_tools_class
	}

	mousedown(e) {
		this.started = false;
		var mouse = this.get_mouse_info(e);
		var params = this.getParams();
		if (mouse.click_valid == false) {
			return;
		}
		if (!config.layer || config.layer.type != 'image') {
			alertify.error('This layer must contain an image. Please convert it to raster to apply this tool.');
			return;
		}

		var src = config.layer.link_canvas;
		if (!src && config.layer.link) {
			if (typeof config.layer.link.complete === 'boolean') {
				if (config.layer.link.complete && config.layer.link.naturalWidth > 0) {
					src = config.layer.link;
				}
			} else if (config.layer.link.width > 0 && config.layer.link.height > 0) {
				src = config.layer.link;
			}
		}
		if (!src) {
			alertify.error('Layer image is not ready.');
			return;
		}

		var lw = (config.layer.width != null && config.layer.width > 0) ? config.layer.width : (config.WIDTH || 1);
		var lh = (config.layer.height != null && config.layer.height > 0) ? config.layer.height : (config.HEIGHT || 1);
		var lwo = config.layer.width_original || lw;
		var lho = config.layer.height_original || lh;

		this.started = true;

		// Create base snapshot to sample from during drag
		this.baseCanvas = document.createElement('canvas');
		this.baseCanvas.width = lwo;
		this.baseCanvas.height = lho;
		var baseCtx = this.baseCanvas.getContext('2d');
		baseCtx.drawImage(src, 0, 0);

		// Output canvas
		this.tmpCanvas = document.createElement('canvas');
		this.tmpCanvasCtx = this.tmpCanvas.getContext("2d");
		this.tmpCanvas.width = lwo;
		this.tmpCanvas.height = lho;
		this.tmpCanvasCtx.drawImage(this.baseCanvas, 0, 0);

		this.selection_snapshot = this.copy_layer_snapshot();

		// Register tmp canvas for faster redraw
		config.layer.link_canvas = this.tmpCanvas;

		// Apply initial distortion
		this.bulgePinch_general(mouse, params.power, params.radius, params.bulge);
		this.constrain_edit_to_selection(this.tmpCanvas, this.selection_snapshot);

		config.need_render = true;
	}

	mousemove(e) {
		var mouse = this.get_mouse_info(e);
		var params = this.getParams();
		if (mouse.is_drag == false)
			return;
		if (mouse.click_valid == false) {
			return;
		}
		if (this.started == false) {
			return;
		}

		// Apply distortion from baseCanvas to tmpCanvas
		this.bulgePinch_general(mouse, params.power, params.radius, params.bulge);
		this.constrain_edit_to_selection(this.tmpCanvas, this.selection_snapshot);

		config.need_render = true;
	}

	async mouseup(e) {
		if (this.started == false) {
			return;
		}
		var layer = config.layer;
		var canvas = this.tmpCanvas;
		if (!layer || !canvas) {
			this.started = false;
			return;
		}
		this.constrain_edit_to_selection(canvas, this.selection_snapshot);

		this.started = false;
		this.tmpCanvas = null;
		this.tmpCanvasCtx = null;
		this.baseCanvas = null;
		this.selection_snapshot = null;

		try {
			await app.State.do_action(
				new app.Actions.Bundle_action('bulge_pinch_tool', 'Bulge/Pinch Tool', [
					new app.Actions.Update_layer_image_action(canvas, layer.id)
				])
			);
		} catch (err) {
			if (layer.link_canvas === canvas) {
				delete layer.link_canvas;
			}
			throw err;
		}
	}

	bulgePinch_general(mouse, power, radius, bulge) {
		if (!this.fx_filter) {
			try {
				this.fx_filter = glfx.canvas();
			} catch (err) {
				console.error('WebGL/glfx initialization error:', err);
				alertify.error('WebGL is required for Bulge/Pinch tool.');
				return;
			}
		}

		var coords = this.get_layer_local_coords(mouse.x, mouse.y, config.layer);
		var mouse_x = Math.round(coords.x);
		var mouse_y = Math.round(coords.y);

		var r = radius || 80;
		var adapted_radius = Math.max(1, Math.round(this.adaptSize(r, 'width')));

		var p = (power == null ? 50 : power) / 100;
		if (p > 1) {
			p = 1;
		}
		if (bulge === false) {
			p = -1 * p;
		}

		var source = this.baseCanvas || this.tmpCanvas;
		var texture = this.fx_filter.texture(source);
		this.fx_filter.draw(texture).bulgePinch(mouse_x, mouse_y, adapted_radius, p).update();

		this.tmpCanvasCtx.clearRect(0, 0, this.tmpCanvas.width, this.tmpCanvas.height);
		this.tmpCanvasCtx.drawImage(this.fx_filter, 0, 0);

		if (texture && typeof texture.destroy === 'function') {
			texture.destroy();
		}
	}

}
export default BulgePinch_class;
