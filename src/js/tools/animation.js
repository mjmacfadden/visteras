import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_selection_class from './../core/base-selection.js';

class Animation_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.name = 'animation';
		this.disable_selection(ctx);
	}

	disable_selection(ctx) {
		var sel_config = {
			enable_background: false,
			enable_borders: false,
			enable_controls: false,
			enable_rotation: false,
			enable_move: false,
			data_function: function () {
				return null;
			},
		};
		this.Base_selection = new Base_selection_class(ctx, sel_config, this.name);
	}

	on_activate() {
		if (app.GUI && app.GUI.GUI_timeline) {
			app.GUI.GUI_timeline.toggle();
		}
		return [];
	}

	on_leave() {
		return [];
	}
}

export default Animation_class;
