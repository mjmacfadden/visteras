import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import ImageFilters from './../libs/imagefilters.js';
import Helper_class from './../libs/helpers.js';

class Sharpen_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();
		this.ctx = ctx;
		this.name = 'sharpen';
		this.tmpCanvas = null;
		this.tmpCanvasCtx = null;
		this.started = false;
		this.selection_snapshot = null;
		this.last_mouse_x = null;
		this.last_mouse_y = null;
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

		// get canvas from layer
		this.tmpCanvas = document.createElement('canvas');
		this.tmpCanvasCtx = this.tmpCanvas.getContext("2d");
		this.tmpCanvas.width = lwo;
		this.tmpCanvas.height = lho;
		this.tmpCanvasCtx.drawImage(src, 0, 0);
		this.selection_snapshot = this.copy_layer_snapshot();

		this.last_mouse_x = mouse.x;
		this.last_mouse_y = mouse.y;

		// do sharpen
		this.sharpen_general('click', mouse, params.size);
		this.constrain_edit_to_selection(this.tmpCanvas, this.selection_snapshot);

		// register tmp canvas for faster redraw
		config.layer.link_canvas = this.tmpCanvas;
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

		var size = Math.max(1, params.size || 30);
		var step = Math.max(5, size / 2);

		if (this.last_mouse_x != null && this.last_mouse_y != null) {
			var dist = Math.hypot(mouse.x - this.last_mouse_x, mouse.y - this.last_mouse_y);
			var steps = Math.min(5, Math.ceil(dist / step));
			for (var s = 1; s <= steps; s++) {
				var t = s / steps;
				var inter_mouse = {
					x: this.last_mouse_x + (mouse.x - this.last_mouse_x) * t,
					y: this.last_mouse_y + (mouse.y - this.last_mouse_y) * t,
					click_x: mouse.click_x,
					click_y: mouse.click_y
				};
				this.sharpen_general('move', inter_mouse, params.size);
			}
		} else {
			this.sharpen_general('move', mouse, params.size);
		}

		this.last_mouse_x = mouse.x;
		this.last_mouse_y = mouse.y;

		this.constrain_edit_to_selection(this.tmpCanvas, this.selection_snapshot);

		// draw draft preview
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
		this.selection_snapshot = null;
		this.last_mouse_x = null;
		this.last_mouse_y = null;

		try {
			await app.State.do_action(
				new app.Actions.Bundle_action('sharpen_tool', 'Sharpen Tool', [
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

	sharpen_general(type, mouse, size) {
		var ctx = this.tmpCanvasCtx;
		var coords = this.get_layer_local_coords(mouse.x, mouse.y, config.layer);
		var mouse_x = Math.round(coords.x);
		var mouse_y = Math.round(coords.y);

		var size_w = Math.max(1, Math.round(this.adaptSize(size, 'width')));
		var size_h = Math.max(1, Math.round(this.adaptSize(size, 'height')));

		// find center
		var center_x = Math.round(mouse_x - size_w / 2);
		var center_y = Math.round(mouse_y - size_h / 2);

		var power = 0.5;
		if (type == 'move') {
			power = power / 10;
		}

		var imageData = ctx.getImageData(center_x, center_y, size_w, size_h);
		var filtered = ImageFilters.Sharpen(imageData, power);
		this.Helper.image_round(this.tmpCanvasCtx, mouse_x, mouse_y, size_w, size_h, filtered);
	}

}
export default Sharpen_class;
