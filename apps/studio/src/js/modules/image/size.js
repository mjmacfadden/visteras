import app from './../../app.js';
import config from './../../config.js';
import Base_gui_class from './../../core/base-gui.js';
import Dialog_class from './../../libs/popup.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import Tools_settings_class from './../tools/settings.js';
import Helper_class from './../../libs/helpers.js';
import { DEFAULT_ANCHOR, anchor_offset, resolve_canvas_size, anchor_grid_html } from './../../libs/canvas-anchor.js';

class Image_size_class {

	constructor() {
		this.Base_gui = new Base_gui_class();
		this.POP = new Dialog_class();
		this.Tools_settings = new Tools_settings_class();
		this.Helper = new Helper_class();
	}

	size() {
		var _this = this;
		var common_dimensions = this.Base_gui.common_dimensions;
		var units = this.Tools_settings.get_setting('default_units');
		var resolution = this.Tools_settings.get_setting('resolution');
		var enable_autoresize = this.Tools_settings.get_setting('enable_autoresize');

		var resolutions = ['Custom'];
		for (var i in common_dimensions) {
			var value = common_dimensions[i];
			resolutions.push(value[0] + 'x' + value[1] + ' - ' + value[2]);
		}

		//convert units
		var width = this.Helper.get_user_unit(config.WIDTH, units, resolution);
		var height = this.Helper.get_user_unit(config.HEIGHT, units, resolution);

		var settings = {
			title: 'Canvas Size',
			params: [
				{name: "w", title: "Width:", value: width, placeholder: width, comment: units},
				{name: "h", title: "Height:", value: height, placeholder: height, comment: units},
				{name: "relative", title: "Relative:", value: false},
				{title: "Anchor:", html: anchor_grid_html(DEFAULT_ANCHOR)},
				{name: "resolution", title: "Resolution:", values: resolutions},
				{name: "layout", title: "Layout:", value: "Custom", values: ["Custom", "Landscape", "Portrait"]},
				{name: "enable_autoresize", title: "Enable autoresize:", value: enable_autoresize},
				{name: "in_proportion", title: "In proportion:", value: false},
			],
			on_load: function () {
				const grid = document.getElementById('canvas_anchor_grid');
				const input = document.getElementById('pop_data_anchor');
				if (grid && input) {
					grid.addEventListener('click', (e) => {
						const cell = e.target.closest('[data-anchor]');
						if (!cell) return;
						input.value = cell.dataset.anchor;
						grid.querySelectorAll('[data-anchor]').forEach((b) => {
							b.classList.toggle('active', b === cell);
							b.setAttribute('aria-pressed', String(b === cell));
						});
					});
				}
				// Relative: the fields switch to "amount to add" (0) and back.
				const rel = document.getElementById('pop_data_relative');
				const w = document.getElementById('pop_data_w');
				const h = document.getElementById('pop_data_h');
				if (rel && w && h) {
					rel.addEventListener('change', () => {
						w.value = rel.checked ? 0 : width;
						h.value = rel.checked ? 0 : height;
					});
				}
			},
			on_finish: function (params) {
				_this.size_handler(params);
			},
		};
		this.POP.show(settings);
	}

	size_handler(data) {
		var width = parseFloat(data.w);
		var height = parseFloat(data.h);
		var ratio = config.WIDTH / config.HEIGHT;
		var units = this.Tools_settings.get_setting('default_units');
		var resolution = this.Tools_settings.get_setting('resolution');

		if (width < 0){
			width = 1;
		}
		if (height < 0){
			height = 1;
		}

		this.Tools_settings.save_setting('enable_autoresize', data.enable_autoresize);
		
		//aspect ratio
		if (isNaN(width) && isNaN(height)){
			alertify.error('Wrong dimensions');
			return;
		}
		if (isNaN(width)){
			width = height * ratio;
		}
		if (isNaN(height)){
			height = width / ratio;
		}
		
		if (data.relative == true && data.resolution == 'Custom') {
			var old_w = this.Helper.get_user_unit(config.WIDTH, units, resolution);
			var old_h = this.Helper.get_user_unit(config.HEIGHT, units, resolution);
			var rel = resolve_canvas_size(old_w, old_h, parseFloat(data.w) || 0, parseFloat(data.h) || 0, true);
			width = Math.max(1, rel.width);
			height = Math.max(1, rel.height);
		}

		if (data.resolution != 'Custom') {
			var dim = data.resolution.split(" ");
			dim = dim[0].split("x");
			width = parseInt(dim[0]);
			height = parseInt(dim[1]);

			if(data.layout == 'Portrait'){
				var tmp = width;
				width = height;
				height = tmp;
			}
		}
		else{
			//convert units
			width = this.Helper.get_internal_unit(width, units, resolution);
			height = this.Helper.get_internal_unit(height, units, resolution);
		}

		var actions = [
			new app.Actions.Prepare_canvas_action('undo'),
			new app.Actions.Update_config_action({
				WIDTH: parseInt(width),
				HEIGHT: parseInt(height)
			}),
		];

		// Anchor (Photoshop default: centre): move content so the anchored
		// side/corner stays put. Full-canvas adjustment layers follow the canvas.
		if (data.in_proportion != true) {
			var shift = anchor_offset(data.anchor || DEFAULT_ANCHOR, config.WIDTH, config.HEIGHT, parseInt(width), parseInt(height));
			for (var j in config.layers) {
				var lyr = config.layers[j];
				if (lyr.type === 'adjustment') {
					var adjPatch = { x: 0, y: 0, width: parseInt(width), height: parseInt(height) };
					if (lyr.mask && typeof lyr.mask === 'object' && (shift.dx || shift.dy)) {
						adjPatch.mask = Object.assign({}, lyr.mask, { x: (lyr.mask.x || 0) + shift.dx, y: (lyr.mask.y || 0) + shift.dy });
					}
					actions.push(new app.Actions.Update_layer_action(lyr.id, adjPatch));
					continue;
				}
				if (!shift.dx && !shift.dy) continue;
				var patch = {};
				if (lyr.x != null && lyr.y != null && lyr.type !== 'group') {
					patch.x = lyr.x + shift.dx;
					patch.y = lyr.y + shift.dy;
				}
				if (lyr.mask && typeof lyr.mask === 'object') {
					patch.mask = Object.assign({}, lyr.mask, { x: (lyr.mask.x || 0) + shift.dx, y: (lyr.mask.y || 0) + shift.dy });
				}
				if (Object.keys(patch).length) actions.push(new app.Actions.Update_layer_action(lyr.id, patch));
			}
		}

		if(data.in_proportion == true) {
			//resize object and change coordinates
			var width_ratio =  config.WIDTH / width;
			var height_ratio = config.HEIGHT / height;
			var ratio = Math.max(width_ratio, height_ratio);

			for (var i in config.layers) {
				var layer = config.layers[i];
				if(layer.x != null && layer.y != null) {
					var data_new = {
						x: Math.round(layer.x / width_ratio),
						y: Math.round(layer.y / height_ratio),
					};
					actions.push(new app.Actions.Update_layer_action(layer.id, data_new));
				}
				if(layer.width != null && layer.height != null) {
					var data_new = {
						width: Math.round(layer.width / ratio),
						height: Math.round(layer.height / ratio),
					};
					actions.push(new app.Actions.Update_layer_action(layer.id, data_new));
				}
			}
		}

		actions.push(new app.Actions.Prepare_canvas_action('do'));

		//execute
		app.State.do_action(
			new app.Actions.Bundle_action('set_image_size', 'Set Image Size', actions)
		);
	}
}

export default Image_size_class;
