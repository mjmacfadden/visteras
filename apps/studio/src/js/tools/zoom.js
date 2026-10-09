import config from './../config.js';
import app from './../app.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import Base_selection_class from './../core/base-selection.js';

export function calc_zoom_step(currentZoom, direction) {
	let zoom = currentZoom;
	if (direction < 0) {
		if (zoom > 3) zoom -= 1;
		else if (zoom > 1) zoom -= 0.5;
		else if (zoom > 0.1) zoom -= 0.1;
		else zoom -= 0.01;
	} else {
		if (zoom < 0.1) zoom += 0.01;
		else if (zoom < 1) zoom += 0.1;
		else if (zoom < 3) zoom += 0.5;
		else zoom += 1;
	}
	zoom = Math.round(zoom * 100) / 100;
	zoom = Math.max(0.01, Math.min(500, zoom));
	return zoom;
}

class Zoom_tool_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.ctx = ctx;
		this.name = 'zoom';

		// Register this tool so no transform controls (blue box) are drawn
		var sel_config = {
			enable_background: false,
			enable_borders: false,
			enable_controls: false,
			enable_rotation: false,
			enable_move: false,
			data_function: function () {
				return config.layer;
			},
		};
		this.Base_selection = new Base_selection_class(this.ctx, sel_config, this.name);
	}

	load() {
		this.default_events();
		this.setup_alt_cursor();
	}

	setup_alt_cursor() {
		const updateCursor = (e) => {
			if (config.TOOL && config.TOOL.name === 'zoom') {
				if (e.altKey) {
					document.body.classList.add('zoom-out');
				} else {
					document.body.classList.remove('zoom-out');
				}
			}
		};
		window.addEventListener('keydown', updateCursor);
		window.addEventListener('keyup', updateCursor);
	}

	mousedown(e) {
		if (e.which != 1 && e.type.indexOf('touch') < 0)
			return;

		const main_wrapper = document.getElementById('main_wrapper');
		if (!main_wrapper || !app.GUI || !app.GUI.GUI_preview)
			return;

		const rect = main_wrapper.getBoundingClientRect();
		const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
		const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

		app.GUI.GUI_preview.zoom_data.x = clientX - rect.left;
		app.GUI.GUI_preview.zoom_data.y = clientY - rect.top;

		if (e.altKey) {
			app.GUI.GUI_preview.zoom(-1);
		} else {
			app.GUI.GUI_preview.zoom(+1);
		}
	}
}

export default Zoom_tool_class;
